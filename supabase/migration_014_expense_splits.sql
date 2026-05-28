-- ============================================================
-- Migration 014: Expense splits & interpersonal balances
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Extend shared_expenses ─────────────────────────────────
ALTER TABLE shared_expenses
  ADD COLUMN IF NOT EXISTS paid_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by_email   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS split_mode      text NOT NULL DEFAULT 'equal'
    CHECK (split_mode IN ('equal', 'custom'));

-- Backfill: treat the person who added each expense as the payer
UPDATE shared_expenses
   SET paid_by_user_id = user_id,
       paid_by_email   = user_email
 WHERE paid_by_user_id IS NULL;

-- ── 2. shared_expense_splits ──────────────────────────────────
-- One row per participant per expense (including the payer's own
-- share so splits always sum to the full expense amount).
CREATE TABLE IF NOT EXISTS shared_expense_splits (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id      uuid          NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
  debtor_user_id  uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debtor_email    text          NOT NULL,
  amount          numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (expense_id, debtor_user_id)
);

CREATE INDEX IF NOT EXISTS ses_expense_idx ON shared_expense_splits(expense_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON shared_expense_splits TO authenticated;

ALTER TABLE shared_expense_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ses_select" ON shared_expense_splits;
DROP POLICY IF EXISTS "ses_insert" ON shared_expense_splits;
DROP POLICY IF EXISTS "ses_delete" ON shared_expense_splits;

CREATE POLICY "ses_select" ON shared_expense_splits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_expenses se
      WHERE se.id = expense_id
        AND is_group_member_or_owner(se.group_id)
    )
  );

CREATE POLICY "ses_insert" ON shared_expense_splits
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shared_expenses se
      WHERE se.id = expense_id
        AND is_group_member_or_owner(se.group_id)
    )
  );

CREATE POLICY "ses_delete" ON shared_expense_splits
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_expenses se
      WHERE se.id = expense_id
        AND is_group_member_or_owner(se.group_id)
    )
  );

-- ── 3. Replace update_shared_expense RPC ──────────────────────
-- Drop old 4-param signature; new version has defaults so
-- existing 4-param call patterns still resolve.
DROP FUNCTION IF EXISTS public.update_shared_expense(uuid, text, numeric, text);

CREATE OR REPLACE FUNCTION public.update_shared_expense(
  p_expense_id      uuid,
  p_category        text,
  p_amount          numeric,
  p_note            text,
  p_paid_by_user_id uuid  DEFAULT NULL,
  p_paid_by_email   text  DEFAULT '',
  p_split_mode      text  DEFAULT 'equal'
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
         split_mode      = p_split_mode
   WHERE id = p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_shared_expense(uuid, text, numeric, text, uuid, text, text) TO authenticated;
