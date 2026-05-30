-- ============================================================
-- Migration 039: Credit card account configuration
-- Run this in the Supabase SQL editor after migration 038.
-- ============================================================

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS credit_limit numeric(14, 2),
  ADD COLUMN IF NOT EXISTS soa_day integer,
  ADD COLUMN IF NOT EXISTS due_day integer,
  ADD COLUMN IF NOT EXISTS last_statement_date date;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS credit_billing_cycle_start date,
  ADD COLUMN IF NOT EXISTS credit_billing_cycle_end date,
  ADD COLUMN IF NOT EXISTS credit_statement_date date,
  ADD COLUMN IF NOT EXISTS credit_due_date date;

ALTER TABLE public.financial_accounts
  DROP CONSTRAINT IF EXISTS financial_accounts_credit_limit_check,
  DROP CONSTRAINT IF EXISTS financial_accounts_soa_day_check,
  DROP CONSTRAINT IF EXISTS financial_accounts_due_day_check;

ALTER TABLE public.financial_accounts
  ADD CONSTRAINT financial_accounts_credit_limit_check
    CHECK (credit_limit IS NULL OR credit_limit > 0),
  ADD CONSTRAINT financial_accounts_soa_day_check
    CHECK (soa_day IS NULL OR soa_day BETWEEN 1 AND 31),
  ADD CONSTRAINT financial_accounts_due_day_check
    CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31);

CREATE OR REPLACE FUNCTION public.clamped_month_date(p_year integer, p_month integer, p_day integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT make_date(
    p_year,
    p_month,
    LEAST(
      p_day,
      EXTRACT(day FROM (date_trunc('month', make_date(p_year, p_month, 1)) + interval '1 month - 1 day'))::integer
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.credit_card_schedule(
  p_expense_date date,
  p_soa_day integer,
  p_due_day integer
)
RETURNS TABLE (
  billing_cycle_start date,
  billing_cycle_end date,
  statement_date date,
  due_date date
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_month_start date := date_trunc('month', p_expense_date)::date;
  v_candidate_statement date;
  v_statement_month date;
  v_previous_statement date;
  v_due_month date;
BEGIN
  IF p_expense_date IS NULL OR p_soa_day IS NULL OR p_due_day IS NULL THEN
    RETURN;
  END IF;

  v_candidate_statement := public.clamped_month_date(
    EXTRACT(year FROM v_month_start)::integer,
    EXTRACT(month FROM v_month_start)::integer,
    p_soa_day
  );

  IF p_expense_date <= v_candidate_statement THEN
    statement_date := v_candidate_statement;
  ELSE
    v_statement_month := (v_month_start + interval '1 month')::date;
    statement_date := public.clamped_month_date(
      EXTRACT(year FROM v_statement_month)::integer,
      EXTRACT(month FROM v_statement_month)::integer,
      p_soa_day
    );
  END IF;

  v_previous_statement := public.clamped_month_date(
    EXTRACT(year FROM (date_trunc('month', statement_date) - interval '1 month'))::integer,
    EXTRACT(month FROM (date_trunc('month', statement_date) - interval '1 month'))::integer,
    p_soa_day
  );

  billing_cycle_start := v_previous_statement + 1;
  billing_cycle_end := statement_date;

  IF p_due_day > p_soa_day THEN
    v_due_month := date_trunc('month', statement_date)::date;
  ELSE
    v_due_month := (date_trunc('month', statement_date) + interval '1 month')::date;
  END IF;

  due_date := public.clamped_month_date(
    EXTRACT(year FROM v_due_month)::integer,
    EXTRACT(month FROM v_due_month)::integer,
    p_due_day
  );

  RETURN NEXT;
END;
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
  IF NEW.type = 'credit' THEN
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

    v_outstanding := ABS(NEW.balance);
    IF v_outstanding > NEW.credit_limit THEN
      RAISE EXCEPTION 'Outstanding balance cannot exceed the credit limit.';
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

  IF NOT FOUND OR v_account.type != 'credit' THEN
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

DROP TRIGGER IF EXISTS trg_set_expense_credit_card_schedule ON public.expenses;
CREATE TRIGGER trg_set_expense_credit_card_schedule
  BEFORE INSERT OR UPDATE OF account_id, created_at ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_expense_credit_card_schedule();

GRANT EXECUTE ON FUNCTION public.clamped_month_date(integer, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_card_schedule(date, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
