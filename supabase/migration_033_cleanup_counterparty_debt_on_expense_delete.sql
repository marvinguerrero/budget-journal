-- ============================================================
-- Migration 033: Clean up both sides of debt-linked expense deletion
-- Run this in the Supabase SQL editor after migration 032.
-- ============================================================

-- When no payment has been confirmed, deleting a debt-linked expense should
-- remove the entire mirrored debt relationship, including the debtor-side row.

CREATE OR REPLACE FUNCTION public.cleanup_unconfirmed_expense_debt(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obligation_ids uuid[];
  v_relationship_ids uuid[];
  v_settlement_ids uuid[];
BEGIN
  IF public.expense_has_confirmed_payment(p_expense_id) THEN
    RAISE EXCEPTION 'This expense cannot be deleted because a payment has already been confirmed.';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[])
  INTO v_obligation_ids
  FROM (
    SELECT po.id
    FROM personal_obligations po
    WHERE po.source_expense_id = p_expense_id

    UNION

    SELECT po.counterparty_obligation_id
    FROM personal_obligations po
    WHERE po.source_expense_id = p_expense_id
      AND po.counterparty_obligation_id IS NOT NULL

    UNION

    SELECT peer.id
    FROM personal_obligations po
    JOIN personal_obligations peer
      ON peer.relationship_id = po.relationship_id
    WHERE po.source_expense_id = p_expense_id
      AND po.relationship_id IS NOT NULL
  ) ids
  WHERE id IS NOT NULL;

  IF COALESCE(array_length(v_obligation_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT relationship_id), ARRAY[]::uuid[])
  INTO v_relationship_ids
  FROM personal_obligations
  WHERE id = ANY(v_obligation_ids)
    AND relationship_id IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[])
  INTO v_settlement_ids
  FROM personal_obligation_settlements
  WHERE obligation_id = ANY(v_obligation_ids)
     OR relationship_id = ANY(v_relationship_ids)
     OR counterparty_settlement_id IN (
       SELECT id
       FROM personal_obligation_settlements
       WHERE obligation_id = ANY(v_obligation_ids)
          OR relationship_id = ANY(v_relationship_ids)
     );

  DELETE FROM notifications
  WHERE related_id = ANY(v_obligation_ids)
     OR related_id = ANY(v_settlement_ids);

  DELETE FROM personal_obligation_settlements
  WHERE id = ANY(v_settlement_ids)
     OR obligation_id = ANY(v_obligation_ids)
     OR relationship_id = ANY(v_relationship_ids)
     OR counterparty_settlement_id = ANY(v_settlement_ids);

  UPDATE personal_obligations
    SET counterparty_obligation_id = NULL
    WHERE id = ANY(v_obligation_ids)
       OR counterparty_obligation_id = ANY(v_obligation_ids);

  DELETE FROM personal_obligations
  WHERE id = ANY(v_obligation_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_unconfirmed_expense_debt_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.cleanup_unconfirmed_expense_debt(OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_unconfirmed_expense_debt_before_delete ON public.expenses;
CREATE TRIGGER trg_cleanup_unconfirmed_expense_debt_before_delete
  BEFORE DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_unconfirmed_expense_debt_before_delete();

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

  IF public.expense_has_confirmed_payment(p_expense_id) THEN
    RAISE EXCEPTION 'This expense cannot be deleted because a payment has already been confirmed.';
  END IF;

  PERFORM public.cleanup_unconfirmed_expense_debt(p_expense_id);

  DELETE FROM expenses
  WHERE id = p_expense_id
    AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_unconfirmed_expense_debt(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expense_safely(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
