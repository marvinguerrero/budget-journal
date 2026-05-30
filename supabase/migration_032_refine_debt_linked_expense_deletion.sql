-- ============================================================
-- Migration 032: Refine debt-linked expense deletion rule
-- Run this in the Supabase SQL editor after migration 031.
-- ============================================================

-- Simple rule:
-- confirmed payment exists -> block deletion
-- no confirmed payment -> allow deletion and cascade pending debt workflow rows

CREATE OR REPLACE FUNCTION public.expense_has_confirmed_payment(p_expense_id uuid)
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
    FROM personal_obligation_settlements pos
    WHERE (
      pos.obligation_id IN (SELECT id FROM all_obligation_ids)
      OR pos.relationship_id IN (SELECT relationship_id FROM relationship_ids)
      OR pos.counterparty_settlement_id IN (
        SELECT id
        FROM personal_obligation_settlements
        WHERE obligation_id IN (SELECT id FROM all_obligation_ids)
      )
    )
    AND (
      pos.status = 'confirmed'
      OR pos.confirmed_at IS NOT NULL
      OR COALESCE(pos.confirmed_amount, 0) > 0
      OR COALESCE(pos.account_movement_processed, false) = true
    )
  );
$$;

-- Keep the old helper name as a compatibility wrapper, but refine its meaning.
CREATE OR REPLACE FUNCTION public.expense_has_settlement_activity(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.expense_has_confirmed_payment(p_expense_id);
$$;

CREATE OR REPLACE FUNCTION public.block_debt_linked_expense_delete_with_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.expense_has_confirmed_payment(OLD.id) THEN
    RAISE EXCEPTION 'This expense cannot be deleted because a payment has already been confirmed.';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_personal_obligation_delete_with_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM personal_obligation_settlements pos
    WHERE (
      pos.obligation_id = OLD.id
      OR pos.obligation_id = OLD.counterparty_obligation_id
      OR (
        OLD.relationship_id IS NOT NULL
        AND pos.relationship_id = OLD.relationship_id
      )
    )
    AND (
      pos.status = 'confirmed'
      OR pos.confirmed_at IS NOT NULL
      OR COALESCE(pos.confirmed_amount, 0) > 0
      OR COALESCE(pos.account_movement_processed, false) = true
    )
  ) THEN
    RAISE EXCEPTION 'This expense cannot be deleted because a payment has already been confirmed.';
  END IF;

  RETURN OLD;
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

  DELETE FROM expenses
  WHERE id = p_expense_id
    AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expense_has_confirmed_payment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_has_settlement_activity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expense_safely(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
