-- ============================================================
-- Migration 009: Financial Accounts with balance tracking
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. financial_accounts ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_accounts (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text          NOT NULL,
  emoji      text          NOT NULL DEFAULT '🏦',
  color      text          NOT NULL DEFAULT '#3B82F6',
  type       text          NOT NULL DEFAULT 'bank'
               CHECK (type IN ('cash','bank','ewallet','credit','savings','investment')),
  balance    numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_user
  ON financial_accounts(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON financial_accounts TO authenticated;
ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fa_select" ON financial_accounts;
DROP POLICY IF EXISTS "fa_insert" ON financial_accounts;
DROP POLICY IF EXISTS "fa_update" ON financial_accounts;
DROP POLICY IF EXISTS "fa_delete" ON financial_accounts;

CREATE POLICY "fa_select" ON financial_accounts
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "fa_insert" ON financial_accounts
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "fa_update" ON financial_accounts
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "fa_delete" ON financial_accounts
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- ── 2. Add account_id to income_entries ───────────────────────
ALTER TABLE income_entries
  ADD COLUMN IF NOT EXISTS account_id uuid
    REFERENCES financial_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_income_entries_account
  ON income_entries(account_id) WHERE account_id IS NOT NULL;

-- ── 3. Add account_id to expenses ─────────────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS account_id uuid
    REFERENCES financial_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_account
  ON expenses(account_id) WHERE account_id IS NOT NULL;

-- ── 4. Balance trigger: income_entries ────────────────────────
CREATE OR REPLACE FUNCTION handle_income_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance + NEW.amount
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance - OLD.amount
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Reverse the old contribution
    IF OLD.account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance - OLD.amount
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
    END IF;
    -- Apply the new contribution
    IF NEW.account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance + NEW.amount
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS income_account_balance_trigger ON income_entries;
CREATE TRIGGER income_account_balance_trigger
  AFTER INSERT OR UPDATE OR DELETE ON income_entries
  FOR EACH ROW EXECUTE FUNCTION handle_income_account_balance();

-- ── 5. Balance trigger: expenses ──────────────────────────────
CREATE OR REPLACE FUNCTION handle_expense_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance - NEW.amount
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance + OLD.amount
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Reverse the old deduction
    IF OLD.account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance + OLD.amount
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
    END IF;
    -- Apply the new deduction
    IF NEW.account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance - NEW.amount
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS expense_account_balance_trigger ON expenses;
CREATE TRIGGER expense_account_balance_trigger
  AFTER INSERT OR UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION handle_expense_account_balance();

-- Grant trigger functions to supabase roles
GRANT EXECUTE ON FUNCTION handle_income_account_balance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION handle_expense_account_balance() TO authenticated, service_role;
