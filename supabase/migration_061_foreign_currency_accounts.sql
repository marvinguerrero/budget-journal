-- ============================================================
-- Migration 061: Foreign-currency cash accounts with weighted-
-- average exchange-rate cost basis.
-- Run this in the Supabase SQL editor after migration_060.
-- ============================================================
--
-- DESIGN SUMMARY
-- ──────────────
-- `financial_accounts.balance` continues to ALWAYS represent the
-- account's value in PHP (base_currency_code). This is the single
-- most important compatibility decision: every existing dashboard,
-- budget, net-worth, and analytics query reads `balance` and needs
-- ZERO changes. For a foreign-currency account, `balance` mirrors
-- `base_cost_balance` (the PHP cost basis) at all times.
--
-- New, purely additive columns:
--   financial_accounts: currency_code, base_currency_code,
--     foreign_balance, base_cost_balance, average_exchange_rate
--   expenses: original_amount, original_currency, converted_amount,
--     exchange_rate_used
--   account_transfers: destination_amount, source_currency,
--     destination_currency, exchange_rate
--
-- SCOPE (v1, intentionally limited — see "FUTURE COMPATIBILITY"
-- in the feature spec for what's deferred):
--   • Currency exchange transfers are ONLY supported FROM a
--     base-currency (PHP) account INTO a foreign-currency account.
--     Reverse (foreign → PHP cash-out) and foreign → foreign
--     transfers are rejected with a clear error — they involve
--     realized gain/loss accounting that is explicitly deferred.
--   • The weighted-average rate updates ONLY on these funding
--     transfers, never on expenses, exactly per spec.
--   • Foreign-currency support is scoped to PERSONAL expenses only
--     (the `expenses` table). Shared Budget expenses continue to
--     require base-currency (PHP) source accounts.
-- ============================================================

-- ── 1. financial_accounts: new columns ────────────────────────
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS base_currency_code text NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS foreign_balance numeric(18, 4),
  ADD COLUMN IF NOT EXISTS base_cost_balance numeric(14, 2),
  ADD COLUMN IF NOT EXISTS average_exchange_rate numeric(18, 6);

-- ── 2. expenses: new columns ───────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS original_amount numeric(14, 2),
  ADD COLUMN IF NOT EXISTS original_currency text,
  ADD COLUMN IF NOT EXISTS converted_amount numeric(14, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate_used numeric(18, 6);

-- ── 3. account_transfers: new columns ──────────────────────────
ALTER TABLE public.account_transfers
  ADD COLUMN IF NOT EXISTS destination_amount numeric(14, 2),
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS destination_currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18, 6);

-- ── 4. New foreign-currency accounts must start at zero ────────
-- Funding happens exclusively via a currency exchange transfer,
-- which is what establishes the first average_exchange_rate.
-- This prevents an account ever existing with a PHP balance that
-- has no foreign_balance/rate backing it.
CREATE OR REPLACE FUNCTION public.enforce_foreign_account_initial_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.currency_code IS NOT NULL AND NEW.currency_code <> NEW.base_currency_code THEN
    NEW.balance := 0;
    NEW.foreign_balance := 0;
    NEW.base_cost_balance := 0;
    NEW.average_exchange_rate := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_foreign_account_initial_state ON public.financial_accounts;
CREATE TRIGGER trg_enforce_foreign_account_initial_state
  BEFORE INSERT ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_foreign_account_initial_state();

-- ── 5. Expense currency conversion (BEFORE INSERT/UPDATE) ──────
-- Treats NEW.amount (or NEW.original_amount, if explicitly
-- supplied — used on edits) as the NATIVE currency amount the
-- user entered. For base-currency accounts, this is a clean no-op
-- and NEW.amount is left completely untouched (today's behavior).
-- For foreign accounts, it stamps original_amount/original_currency
-- /exchange_rate_used, computes converted_amount, and OVERWRITES
-- NEW.amount with the PHP equivalent so every existing PHP-based
-- consumer (budgets, analytics, dashboards, shared splits, the
-- existing balance trigger below) keeps working unmodified.
CREATE OR REPLACE FUNCTION public.compute_expense_currency_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account financial_accounts;
  v_native numeric;
BEGIN
  IF NEW.account_id IS NULL THEN
    NEW.original_amount := NULL;
    NEW.original_currency := NULL;
    NEW.converted_amount := NULL;
    NEW.exchange_rate_used := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO v_account FROM financial_accounts WHERE id = NEW.account_id;
  IF NOT FOUND THEN
    RETURN NEW; -- let the FK constraint reject an invalid account_id
  END IF;

  IF v_account.currency_code IS NULL OR v_account.currency_code = v_account.base_currency_code THEN
    NEW.original_amount := NULL;
    NEW.original_currency := NULL;
    NEW.converted_amount := NULL;
    NEW.exchange_rate_used := NULL;
    RETURN NEW;
  END IF;

  IF v_account.average_exchange_rate IS NULL OR v_account.average_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'The account "%" has no exchange rate yet. Fund it with a currency exchange transfer before recording expenses.', v_account.name;
  END IF;

  v_native := COALESCE(NEW.original_amount, NEW.amount);
  IF v_native IS NULL OR v_native <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than zero.';
  END IF;

  NEW.original_amount := v_native;
  NEW.original_currency := v_account.currency_code;
  NEW.exchange_rate_used := v_account.average_exchange_rate;
  NEW.converted_amount := round(v_native * v_account.average_exchange_rate, 2);
  NEW.amount := NEW.converted_amount;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_expense_currency_conversion ON public.expenses;
CREATE TRIGGER trg_compute_expense_currency_conversion
  BEFORE INSERT OR UPDATE OF amount, account_id, original_amount ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.compute_expense_currency_conversion();

-- ── 6. Foreign-currency account-side bookkeeping (AFTER) ───────
-- Runs alongside (does NOT replace) the existing
-- handle_expense_account_balance() trigger, which keeps deducting
-- NEW.amount (already the PHP value, thanks to step 5) from
-- `balance` exactly as it always has. This trigger ADDITIONALLY
-- moves foreign_balance/base_cost_balance for foreign accounts.
-- average_exchange_rate is NEVER touched here — per the spec's
-- core rule, expenses must never recalculate the average rate.
CREATE OR REPLACE FUNCTION public.handle_expense_foreign_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_id IS NOT NULL AND NEW.original_currency IS NOT NULL THEN
      UPDATE financial_accounts
         SET foreign_balance   = COALESCE(foreign_balance, 0) - NEW.original_amount,
             base_cost_balance = COALESCE(base_cost_balance, 0) - NEW.converted_amount
       WHERE id = NEW.account_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.account_id IS NOT NULL AND OLD.original_currency IS NOT NULL THEN
      UPDATE financial_accounts
         SET foreign_balance   = COALESCE(foreign_balance, 0) + OLD.original_amount,
             base_cost_balance = COALESCE(base_cost_balance, 0) + OLD.converted_amount
       WHERE id = OLD.account_id;
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.account_id IS NOT NULL AND OLD.original_currency IS NOT NULL THEN
      UPDATE financial_accounts
         SET foreign_balance   = COALESCE(foreign_balance, 0) + OLD.original_amount,
             base_cost_balance = COALESCE(base_cost_balance, 0) + OLD.converted_amount
       WHERE id = OLD.account_id;
    END IF;
    IF NEW.account_id IS NOT NULL AND NEW.original_currency IS NOT NULL THEN
      UPDATE financial_accounts
         SET foreign_balance   = COALESCE(foreign_balance, 0) - NEW.original_amount,
             base_cost_balance = COALESCE(base_cost_balance, 0) - NEW.converted_amount
       WHERE id = NEW.account_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_foreign_balance ON public.expenses;
CREATE TRIGGER trg_expense_foreign_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_expense_foreign_balance();

-- ── 7. Transfer balance trigger: currency-exchange-aware ───────
-- Replaces handle_transfer_balance(). Same-currency transfers
-- (the default, destination_amount IS NULL) behave byte-for-byte
-- identically to before. A currency exchange transfer (PHP →
-- foreign, destination_amount provided) additionally moves
-- foreign_balance/base_cost_balance on the destination account and
-- recalculates its weighted-average rate:
--   new_rate = total_php_cost / total_foreign_units
-- Any transfer touching a foreign-currency account outside this
-- exact shape is rejected (see SCOPE note at the top of this file).
CREATE OR REPLACE FUNCTION public.handle_transfer_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from financial_accounts;
  v_to   financial_accounts;
  v_new_foreign   numeric;
  v_new_base_cost numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_from FROM financial_accounts WHERE id = NEW.from_account_id;
    SELECT * INTO v_to   FROM financial_accounts WHERE id = NEW.to_account_id;

    IF NEW.destination_amount IS NOT NULL THEN
      IF v_from.currency_code IS DISTINCT FROM v_from.base_currency_code THEN
        RAISE EXCEPTION 'Currency exchange transfers must originate from a base-currency (%) account.', v_from.base_currency_code;
      END IF;
      IF v_to.currency_code IS NOT DISTINCT FROM v_to.base_currency_code THEN
        RAISE EXCEPTION 'Destination account already uses %; this is a normal transfer, not a currency exchange.', v_to.base_currency_code;
      END IF;

      UPDATE financial_accounts SET balance = balance - NEW.amount WHERE id = NEW.from_account_id;

      v_new_foreign   := COALESCE(v_to.foreign_balance, 0) + NEW.destination_amount;
      v_new_base_cost := COALESCE(v_to.base_cost_balance, 0) + NEW.amount;

      UPDATE financial_accounts
         SET balance               = balance + NEW.amount,
             foreign_balance       = v_new_foreign,
             base_cost_balance     = v_new_base_cost,
             average_exchange_rate = round(v_new_base_cost / v_new_foreign, 6)
       WHERE id = NEW.to_account_id;
    ELSE
      IF v_from.currency_code IS DISTINCT FROM v_from.base_currency_code
         OR v_to.currency_code IS DISTINCT FROM v_to.base_currency_code THEN
        RAISE EXCEPTION 'Transfers involving a foreign-currency account require a destination amount for currency exchange.';
      END IF;

      UPDATE financial_accounts SET balance = balance - NEW.amount WHERE id = NEW.from_account_id;
      UPDATE financial_accounts SET balance = balance + NEW.amount WHERE id = NEW.to_account_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.destination_amount IS NOT NULL THEN
      UPDATE financial_accounts SET balance = balance + OLD.amount WHERE id = OLD.from_account_id;

      UPDATE financial_accounts
         SET balance           = balance - OLD.amount,
             foreign_balance   = COALESCE(foreign_balance, 0) - OLD.destination_amount,
             base_cost_balance = COALESCE(base_cost_balance, 0) - OLD.amount,
             average_exchange_rate = CASE
               WHEN COALESCE(foreign_balance, 0) - OLD.destination_amount > 0
                 THEN round((COALESCE(base_cost_balance, 0) - OLD.amount) / (COALESCE(foreign_balance, 0) - OLD.destination_amount), 6)
               ELSE NULL
             END
       WHERE id = OLD.to_account_id;
    ELSE
      UPDATE financial_accounts SET balance = balance + OLD.amount WHERE id = OLD.from_account_id;
      UPDATE financial_accounts SET balance = balance - OLD.amount WHERE id = OLD.to_account_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 8. Currency-exchange-aware transfer RPC ─────────────────────
DROP FUNCTION IF EXISTS public.create_account_transfer_with_fee(uuid, uuid, numeric, text, timestamptz, numeric);

CREATE OR REPLACE FUNCTION public.create_account_transfer_with_fee(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_note text DEFAULT '',
  p_transferred_at timestamptz DEFAULT now(),
  p_transfer_fee numeric DEFAULT 0,
  p_destination_amount numeric DEFAULT NULL
)
RETURNS public.account_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_from_account financial_accounts;
  v_to_account financial_accounts;
  v_transfer account_transfers;
  v_fee_expense_id uuid;
  v_transfer_fee numeric(14, 2) := COALESCE(p_transfer_fee, 0);
  v_exchange_rate numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_from_account_id IS NULL THEN RAISE EXCEPTION 'Source account is required.'; END IF;
  IF p_to_account_id IS NULL THEN RAISE EXCEPTION 'Destination account is required.'; END IF;
  IF p_from_account_id = p_to_account_id THEN RAISE EXCEPTION 'Source and destination accounts must be different.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Transfer amount must be greater than zero.'; END IF;
  IF v_transfer_fee < 0 THEN RAISE EXCEPTION 'Transfer fee cannot be negative.'; END IF;

  SELECT * INTO v_from_account FROM public.financial_accounts WHERE id = p_from_account_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source account not found.'; END IF;

  SELECT * INTO v_to_account FROM public.financial_accounts WHERE id = p_to_account_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Destination account not found.'; END IF;

  IF p_destination_amount IS NOT NULL THEN
    IF p_destination_amount <= 0 THEN RAISE EXCEPTION 'Destination amount must be greater than zero.'; END IF;
    IF v_from_account.currency_code IS DISTINCT FROM v_from_account.base_currency_code THEN
      RAISE EXCEPTION 'Currency exchange transfers must originate from a base-currency (%) account.', v_from_account.base_currency_code;
    END IF;
    IF v_to_account.currency_code IS NOT DISTINCT FROM v_to_account.base_currency_code THEN
      RAISE EXCEPTION 'Destination account already uses %; this is a normal transfer, not a currency exchange.', v_to_account.base_currency_code;
    END IF;
    v_exchange_rate := round(p_amount / p_destination_amount, 6);
  ELSE
    IF v_from_account.currency_code IS DISTINCT FROM v_from_account.base_currency_code
       OR v_to_account.currency_code IS DISTINCT FROM v_to_account.base_currency_code THEN
      RAISE EXCEPTION 'Transfers involving a foreign-currency account require a destination amount for currency exchange.';
    END IF;
  END IF;

  INSERT INTO public.account_transfers (
    user_id, from_account_id, to_account_id, amount, note, transferred_at, transfer_fee,
    destination_amount, source_currency, destination_currency, exchange_rate
  )
  VALUES (
    v_uid, p_from_account_id, p_to_account_id, p_amount, COALESCE(p_note, ''), COALESCE(p_transferred_at, now()), v_transfer_fee,
    p_destination_amount,
    v_from_account.currency_code,
    v_to_account.currency_code,
    v_exchange_rate
  )
  RETURNING * INTO v_transfer;

  IF v_transfer_fee > 0 THEN
    INSERT INTO public.expenses (
      user_id, amount, category, note, account_id, created_at
    )
    VALUES (
      v_uid, v_transfer_fee, 'Transfer Fees',
      'Transfer Fee - ' || v_from_account.name || ' → ' || v_to_account.name,
      p_from_account_id, COALESCE(p_transferred_at, now())
    )
    RETURNING id INTO v_fee_expense_id;

    UPDATE public.account_transfers
       SET fee_expense_id = v_fee_expense_id
     WHERE id = v_transfer.id
    RETURNING * INTO v_transfer;
  END IF;

  RETURN v_transfer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_account_transfer_with_fee(uuid, uuid, numeric, text, timestamptz, numeric, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
