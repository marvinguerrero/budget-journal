-- ============================================================
-- Migration 031: Protect debt-linked expense deletion
-- Run this in the Supabase SQL editor after migration 030.
-- ============================================================

CREATE OR REPLACE FUNCTION public.expense_has_settlement_activity(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH linked_obligations AS (
    SELECT
      po.id,
      po.counterparty_obligation_id,
      po.relationship_id,
      po.status
    FROM personal_obligations po
    WHERE po.source_expense_id = p_expense_id
  ),
  all_obligation_ids AS (
    SELECT id FROM linked_obligations
    UNION
    SELECT counterparty_obligation_id
    FROM linked_obligations
    WHERE counterparty_obligation_id IS NOT NULL
  ),
  relationship_ids AS (
    SELECT relationship_id
    FROM linked_obligations
    WHERE relationship_id IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1
    FROM linked_obligations
    WHERE status = 'settled'
  )
  OR EXISTS (
    SELECT 1
    FROM personal_obligation_settlements pos
    WHERE pos.obligation_id IN (SELECT id FROM all_obligation_ids)
       OR pos.relationship_id IN (SELECT relationship_id FROM relationship_ids)
       OR pos.counterparty_settlement_id IN (
         SELECT id
         FROM personal_obligation_settlements
         WHERE obligation_id IN (SELECT id FROM all_obligation_ids)
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.block_debt_linked_expense_delete_with_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.expense_has_settlement_activity(OLD.id) THEN
    RAISE EXCEPTION 'This expense cannot be deleted because settlement activity already exists. Cancel or resolve the debt first.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_debt_linked_expense_delete_with_activity ON public.expenses;
CREATE TRIGGER trg_block_debt_linked_expense_delete_with_activity
  BEFORE DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.block_debt_linked_expense_delete_with_activity();

CREATE OR REPLACE FUNCTION public.block_personal_obligation_delete_with_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.source_expense_id IS NOT NULL
    AND public.expense_has_settlement_activity(OLD.source_expense_id)
  )
  OR OLD.status = 'settled'
  OR EXISTS (
    SELECT 1
    FROM personal_obligation_settlements pos
    WHERE pos.obligation_id = OLD.id
       OR pos.obligation_id = OLD.counterparty_obligation_id
       OR (
         OLD.relationship_id IS NOT NULL
         AND pos.relationship_id = OLD.relationship_id
       )
  ) THEN
    RAISE EXCEPTION 'This expense cannot be deleted because settlement activity already exists. Cancel or resolve the debt first.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_personal_obligation_delete_with_activity ON public.personal_obligations;
CREATE TRIGGER trg_block_personal_obligation_delete_with_activity
  BEFORE DELETE ON public.personal_obligations
  FOR EACH ROW EXECUTE FUNCTION public.block_personal_obligation_delete_with_activity();

CREATE OR REPLACE FUNCTION public.delete_expense_safely(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_expense expenses;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;

  IF public.expense_has_settlement_activity(p_expense_id) THEN
    RAISE EXCEPTION 'This expense cannot be deleted because settlement activity already exists. Cancel or resolve the debt first.';
  END IF;

  DELETE FROM expenses
  WHERE id = p_expense_id
    AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expense_has_settlement_activity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expense_safely(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
