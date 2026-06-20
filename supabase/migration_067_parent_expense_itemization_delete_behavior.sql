-- ============================================================
-- Migration 067: Separate parent expense and line item deletion
-- Run this after migration_066.
-- ============================================================
--
-- Parent expense delete:
--   - cleans unmoved itemization-derived debt
--   - deletes the parent expense
--   - cascades expense_line_items/expense_participants by FK
--
-- Line item delete:
--   - remains handled by delete_expense_line_item_safely()
--   - deletes only that line item after cleaning its unmoved debt

CREATE OR REPLACE FUNCTION public.expense_itemization_has_settlement_activity(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_line_items eli
    WHERE eli.expense_id = p_expense_id
      AND public.line_item_has_settlement_activity(eli.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.cleanup_unmoved_expense_itemization_debt(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_expense public.expenses;
  v_line_item record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT *
  INTO v_expense
  FROM public.expenses
  WHERE id = p_expense_id
    AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found.';
  END IF;

  IF public.expense_itemization_has_settlement_activity(p_expense_id) THEN
    RAISE EXCEPTION 'This expense cannot be deleted because one or more itemized items have settlement activity. Reverse or resolve the obligation first.';
  END IF;

  FOR v_line_item IN
    SELECT id
    FROM public.expense_line_items
    WHERE expense_id = p_expense_id
      AND user_id = v_uid
  LOOP
    PERFORM public.cleanup_unmoved_line_item_debt(v_line_item.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_expense_safely(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_expense public.expenses;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_expense
  FROM public.expenses
  WHERE id = p_expense_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;

  IF public.expense_has_settlement_activity(p_expense_id) THEN
    PERFORM public.log_and_raise_expense_settlement_delete_block(p_expense_id);
  END IF;

  IF public.expense_itemization_has_settlement_activity(p_expense_id) THEN
    RAISE EXCEPTION 'This expense cannot be deleted because one or more itemized items have settlement activity. Reverse or resolve the obligation first.';
  END IF;

  PERFORM public.cleanup_unconfirmed_expense_debt(p_expense_id);
  PERFORM public.cleanup_unmoved_expense_itemization_debt(p_expense_id);

  DELETE FROM public.expenses
  WHERE id = p_expense_id
    AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expense_itemization_has_settlement_activity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_unmoved_expense_itemization_debt(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expense_safely(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
