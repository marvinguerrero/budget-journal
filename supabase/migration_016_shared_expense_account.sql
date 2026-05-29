-- ============================================================
-- Migration 016: Payment source (Financial Account) for shared expenses
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Add account_id to shared_expenses ─────────────────────
ALTER TABLE shared_expenses
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES financial_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS se_account_idx ON shared_expenses(account_id);

-- ── 2. Balance trigger for shared_expenses ────────────────────
-- Mirrors the personal expense trigger (migration_009) but
-- targets the shared_expenses table.
CREATE OR REPLACE FUNCTION public.handle_shared_expense_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_id IS NOT NULL THEN
      UPDATE financial_accounts
         SET balance = balance - NEW.amount
       WHERE id = NEW.account_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Reverse the old contribution
    IF OLD.account_id IS NOT NULL THEN
      UPDATE financial_accounts
         SET balance = balance + OLD.amount
       WHERE id = OLD.account_id;
    END IF;
    -- Apply the new contribution
    IF NEW.account_id IS NOT NULL THEN
      UPDATE financial_accounts
         SET balance = balance - NEW.amount
       WHERE id = NEW.account_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.account_id IS NOT NULL THEN
      UPDATE financial_accounts
         SET balance = balance + OLD.amount
       WHERE id = OLD.account_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS shared_expense_account_balance_trigger ON shared_expenses;
CREATE TRIGGER shared_expense_account_balance_trigger
  AFTER INSERT OR UPDATE OR DELETE ON shared_expenses
  FOR EACH ROW EXECUTE FUNCTION handle_shared_expense_account_balance();

-- ── 3. Replace update_shared_expense RPC (add account_id) ─────
-- Drop old 7-param version from migration_014.
DROP FUNCTION IF EXISTS public.update_shared_expense(uuid, text, numeric, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.update_shared_expense(
  p_expense_id      uuid,
  p_category        text,
  p_amount          numeric,
  p_note            text,
  p_paid_by_user_id uuid  DEFAULT NULL,
  p_paid_by_email   text  DEFAULT '',
  p_split_mode      text  DEFAULT 'equal',
  p_account_id      uuid  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense shared_expenses;
  v_owner   uuid;
BEGIN
  SELECT * INTO v_expense FROM shared_expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = v_expense.group_id;

  IF v_expense.user_id != auth.uid()
    AND v_owner != auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM shared_group_members
       WHERE group_id = v_expense.group_id
         AND user_id  = auth.uid()
         AND can_edit_budget = true
    )
  THEN
    RAISE EXCEPTION 'You do not have permission to edit this expense';
  END IF;

  UPDATE shared_expenses
     SET category        = p_category,
         amount          = p_amount,
         note            = p_note,
         paid_by_user_id = COALESCE(p_paid_by_user_id, user_id),
         paid_by_email   = CASE WHEN p_paid_by_email = '' THEN user_email ELSE p_paid_by_email END,
         split_mode      = p_split_mode,
         account_id      = p_account_id
   WHERE id = p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_shared_expense(uuid, text, numeric, text, uuid, text, text, uuid) TO authenticated;
