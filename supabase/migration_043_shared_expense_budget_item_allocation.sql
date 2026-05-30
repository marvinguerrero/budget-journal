-- ============================================================
-- Migration 043: Shared expense budget item allocation
-- Run this in the Supabase SQL editor after migration 042.
-- ============================================================

ALTER TABLE public.shared_expenses
  ADD COLUMN IF NOT EXISTS shared_budget_id uuid REFERENCES public.shared_budgets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shared_expenses_shared_budget_idx
  ON public.shared_expenses(shared_budget_id)
  WHERE shared_budget_id IS NOT NULL;

-- Backfill only when a category maps to exactly one budget item in that group.
WITH category_budget_counts AS (
  SELECT
    group_id,
    category,
    COUNT(*) AS budget_count,
    (array_agg(id ORDER BY created_at, id::text))[1] AS budget_id
  FROM public.shared_budgets
  GROUP BY group_id, category
)
UPDATE public.shared_expenses se
  SET shared_budget_id = cbc.budget_id
FROM category_budget_counts cbc
WHERE se.shared_budget_id IS NULL
  AND se.group_id = cbc.group_id
  AND se.category = cbc.category
  AND cbc.budget_count = 1;

DROP FUNCTION IF EXISTS public.update_shared_expense(
  uuid,
  text,
  numeric,
  text,
  uuid,
  text,
  text,
  uuid,
  text
);

CREATE OR REPLACE FUNCTION public.update_shared_expense(
  p_expense_id            uuid,
  p_category              text,
  p_amount                numeric,
  p_note                  text,
  p_paid_by_user_id       uuid DEFAULT NULL,
  p_paid_by_email         text DEFAULT '',
  p_split_mode            text DEFAULT 'equal',
  p_account_id            uuid DEFAULT NULL,
  p_payment_source_status text DEFAULT 'confirmed',
  p_shared_budget_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense shared_expenses;
  v_owner uuid;
  v_budget shared_budgets;
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

  IF p_shared_budget_id IS NOT NULL THEN
    SELECT * INTO v_budget
    FROM shared_budgets
    WHERE id = p_shared_budget_id
      AND group_id = v_expense.group_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Budget item not found';
    END IF;
  END IF;

  PERFORM public.cancel_pending_shared_settlements(v_expense.group_id);

  UPDATE shared_expenses
    SET category = p_category,
        shared_budget_id = p_shared_budget_id,
        amount = p_amount,
        note = p_note,
        paid_by_user_id = COALESCE(p_paid_by_user_id, user_id),
        paid_by_email = CASE WHEN p_paid_by_email = '' THEN user_email ELSE p_paid_by_email END,
        split_mode = p_split_mode,
        account_id = p_account_id,
        payment_source_status = p_payment_source_status
    WHERE id = p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_shared_expense(uuid, text, numeric, text, uuid, text, text, uuid, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
