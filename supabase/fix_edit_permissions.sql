-- ============================================================
-- Fix: Add edit RPCs for expenses and budgets with capability checks
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. update_shared_expense ──────────────────────────────────
-- Allowed: own expense | group owner | member with can_edit_budget
CREATE OR REPLACE FUNCTION public.update_shared_expense(
  p_expense_id uuid,
  p_category   text,
  p_amount     numeric,
  p_note       text
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
         AND user_id = auth.uid()
         AND can_edit_budget = true
    )
  THEN
    RAISE EXCEPTION 'You do not have permission to edit this expense';
  END IF;

  UPDATE shared_expenses
     SET category = p_category,
         amount   = p_amount,
         note     = p_note
   WHERE id = p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_shared_expense(uuid, text, numeric, text) TO authenticated;

-- ── 2. update_shared_budget ───────────────────────────────────
-- Allowed: group owner | member with can_edit_budget
CREATE OR REPLACE FUNCTION public.update_shared_budget(
  p_budget_id uuid,
  p_amount    numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget shared_budgets;
  v_owner  uuid;
BEGIN
  SELECT * INTO v_budget FROM shared_budgets WHERE id = p_budget_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Budget not found'; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = v_budget.group_id;

  IF v_owner != auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM shared_group_members
       WHERE group_id = v_budget.group_id
         AND user_id = auth.uid()
         AND can_edit_budget = true
    )
  THEN
    RAISE EXCEPTION 'You do not have permission to edit this budget';
  END IF;

  UPDATE shared_budgets SET amount = p_amount WHERE id = p_budget_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_shared_budget(uuid, numeric) TO authenticated;
