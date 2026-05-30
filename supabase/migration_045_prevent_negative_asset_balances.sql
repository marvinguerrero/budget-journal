-- ============================================================
-- Migration 045: Prevent negative asset balances
-- Run this in the Supabase SQL editor after migration 044.
-- ============================================================

-- Central rule:
-- - Asset accounts cannot go below zero.
-- - Credit card liability accounts cannot exceed their configured limit.
-- This protects expenses, shared budget expenses, transfers, settlements,
-- debt payments, credit card payments, and future balance-moving code.

CREATE OR REPLACE FUNCTION public.is_credit_card_account_type(p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(COALESCE(p_type, ''))) IN ('credit', 'credit card');
$$;

CREATE OR REPLACE FUNCTION public.validate_credit_card_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outstanding numeric(14, 2);
BEGIN
  IF NEW.category = 'asset' AND NEW.balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance in selected account.';
  END IF;

  IF public.is_credit_card_account_type(NEW.type) THEN
    IF NEW.category != 'liability' THEN
      RAISE EXCEPTION 'Credit Card accounts must use the Liability category.';
    END IF;
    IF NEW.credit_limit IS NULL OR NEW.credit_limit <= 0 THEN
      RAISE EXCEPTION 'Credit limit must be greater than 0.';
    END IF;
    IF NEW.soa_day IS NULL OR NEW.soa_day NOT BETWEEN 1 AND 31 THEN
      RAISE EXCEPTION 'SOA day must be between 1 and 31.';
    END IF;
    IF NEW.due_day IS NULL OR NEW.due_day NOT BETWEEN 1 AND 31 THEN
      RAISE EXCEPTION 'Due day must be between 1 and 31.';
    END IF;

    v_outstanding := GREATEST(0, -NEW.balance);
    IF v_outstanding > NEW.credit_limit THEN
      RAISE EXCEPTION 'Credit limit exceeded.';
    END IF;
  ELSE
    NEW.credit_limit := NULL;
    NEW.soa_day := NULL;
    NEW.due_day := NULL;
    NEW.last_statement_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_credit_card_account ON public.financial_accounts;
CREATE TRIGGER trg_validate_credit_card_account
  BEFORE INSERT OR UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_credit_card_account();

CREATE OR REPLACE FUNCTION public.set_expense_credit_card_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account financial_accounts;
  v_schedule record;
BEGIN
  NEW.credit_billing_cycle_start := NULL;
  NEW.credit_billing_cycle_end := NULL;
  NEW.credit_statement_date := NULL;
  NEW.credit_due_date := NULL;

  IF NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_account
  FROM financial_accounts
  WHERE id = NEW.account_id
    AND user_id = NEW.user_id;

  IF NOT FOUND OR NOT public.is_credit_card_account_type(v_account.type) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_schedule
  FROM public.credit_card_schedule(NEW.created_at::date, v_account.soa_day, v_account.due_day);

  IF FOUND THEN
    NEW.credit_billing_cycle_start := v_schedule.billing_cycle_start;
    NEW.credit_billing_cycle_end := v_schedule.billing_cycle_end;
    NEW.credit_statement_date := v_schedule.statement_date;
    NEW.credit_due_date := v_schedule.due_date;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_credit_card_account_type(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_credit_card_account() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_expense_credit_card_schedule() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
