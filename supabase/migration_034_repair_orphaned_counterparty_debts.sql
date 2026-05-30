-- ============================================================
-- Migration 034: Repair orphaned counterparty debts
-- Run this in the Supabase SQL editor after migration 033.
-- ============================================================

-- If older cleanup deleted the source-side expense/obligation but left the
-- debtor-side mirrored row, remove that orphan when no confirmed payment exists.

CREATE OR REPLACE FUNCTION public.obligation_has_confirmed_payment(p_obligation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT id, counterparty_obligation_id, relationship_id
    FROM personal_obligations
    WHERE id = p_obligation_id
  ),
  all_obligation_ids AS (
    SELECT id FROM base
    UNION
    SELECT counterparty_obligation_id
    FROM base
    WHERE counterparty_obligation_id IS NOT NULL
  ),
  relationship_ids AS (
    SELECT relationship_id
    FROM base
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
           OR relationship_id IN (SELECT relationship_id FROM relationship_ids)
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

CREATE OR REPLACE FUNCTION public.cleanup_unconfirmed_obligation_relationship(p_obligation_id uuid)
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
  IF public.obligation_has_confirmed_payment(p_obligation_id) THEN
    RAISE EXCEPTION 'This debt cannot be deleted because a payment has already been confirmed.';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[])
  INTO v_obligation_ids
  FROM (
    SELECT po.id
    FROM personal_obligations po
    WHERE po.id = p_obligation_id

    UNION

    SELECT po.counterparty_obligation_id
    FROM personal_obligations po
    WHERE po.id = p_obligation_id
      AND po.counterparty_obligation_id IS NOT NULL

    UNION

    SELECT peer.id
    FROM personal_obligations po
    JOIN personal_obligations peer
      ON peer.relationship_id = po.relationship_id
    WHERE po.id = p_obligation_id
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

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_unconfirmed_counterparty_debts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orphan_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_orphan_id IN
    SELECT po.id
    FROM personal_obligations po
    WHERE po.source_expense_id IS NULL
      AND po.status = 'open'
      AND po.created_by_user_id IS NOT NULL
      AND po.created_by_user_id != po.user_id
      AND (
        po.counterparty_obligation_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM personal_obligations source_po
          WHERE source_po.id = po.counterparty_obligation_id
        )
      )
      AND NOT public.obligation_has_confirmed_payment(po.id)
  LOOP
    PERFORM public.cleanup_unconfirmed_obligation_relationship(v_orphan_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

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

    UNION

    SELECT peer.id
    FROM personal_obligations po
    JOIN personal_obligations peer
      ON peer.user_id = po.contact_user_id
     AND peer.contact_user_id = po.user_id
     AND peer.created_by_user_id = po.user_id
     AND peer.amount = po.amount
     AND peer.category = po.category
     AND peer.status = 'open'
    WHERE po.source_expense_id = p_expense_id
      AND po.contact_user_id IS NOT NULL
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

-- Repair existing orphan rows left by earlier cleanup attempts.
SELECT public.cleanup_orphaned_unconfirmed_counterparty_debts();

GRANT EXECUTE ON FUNCTION public.obligation_has_confirmed_payment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_unconfirmed_obligation_relationship(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_unconfirmed_counterparty_debts() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
