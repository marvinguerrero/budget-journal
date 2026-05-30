-- ============================================================
-- Migration 041: Shared budget items
-- Run this in the Supabase SQL editor after migration 040.
-- ============================================================

ALTER TABLE public.shared_budgets
  ADD COLUMN IF NOT EXISTS item text;

UPDATE public.shared_budgets
  SET item = category
  WHERE item IS NULL OR length(trim(item)) = 0;

ALTER TABLE public.shared_budgets
  ALTER COLUMN item SET NOT NULL;

ALTER TABLE public.shared_budgets
  DROP CONSTRAINT IF EXISTS shared_budgets_group_id_category_key,
  DROP CONSTRAINT IF EXISTS shared_budgets_item_check;

ALTER TABLE public.shared_budgets
  ADD CONSTRAINT shared_budgets_item_check CHECK (length(trim(item)) > 0);

DROP INDEX IF EXISTS public.shared_budgets_group_category_item_unique_idx;
CREATE UNIQUE INDEX shared_budgets_group_category_item_unique_idx
  ON public.shared_budgets(group_id, lower(category), lower(item));

DROP FUNCTION IF EXISTS public.update_shared_budget(uuid, numeric);

CREATE OR REPLACE FUNCTION public.update_shared_budget(
  p_budget_id uuid,
  p_amount numeric,
  p_item text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget shared_budgets;
BEGIN
  SELECT * INTO v_budget
  FROM shared_budgets
  WHERE id = p_budget_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Budget not found'; END IF;
  IF NOT public.can_edit_shared_budget(v_budget.group_id) THEN
    RAISE EXCEPTION 'Not allowed to edit this budget';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Budget amount must be greater than zero';
  END IF;
  IF p_item IS NOT NULL AND length(trim(p_item)) = 0 THEN
    RAISE EXCEPTION 'Budget item is required';
  END IF;

  UPDATE shared_budgets
    SET amount = p_amount,
        item = COALESCE(NULLIF(trim(p_item), ''), item)
    WHERE id = p_budget_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_shared_budget(uuid, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
