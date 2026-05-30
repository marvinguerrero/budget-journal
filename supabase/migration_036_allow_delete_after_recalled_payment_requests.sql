-- ============================================================
-- Migration 036: Allow debt expense deletion after recalled requests
-- Run this in the Supabase SQL editor after migration 035.
-- ============================================================

-- Deletion rule:
-- - No payment process ever started: allowed
-- - All requests recalled and no money movement: allowed
-- - Any active pending/awaiting request: blocked
-- - Any confirmed/partial/account movement history: blocked

CREATE OR REPLACE FUNCTION public.expense_blocking_settlement_activity(p_expense_id uuid)
RETURNS TABLE (
  settlement_id uuid,
  obligation_id uuid,
  status text,
  activity_reason text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH source_obligations AS (
    SELECT
      po.id,
      po.user_id,
      po.contact_user_id,
      po.counterparty_obligation_id,
      po.relationship_id,
      po.amount,
      po.category,
      po.status
    FROM personal_obligations po
    WHERE po.source_expense_id = p_expense_id
  ),
  inverse_obligations AS (
    SELECT peer.id
    FROM source_obligations po
    JOIN personal_obligations peer
      ON peer.user_id = po.contact_user_id
     AND peer.contact_user_id = po.user_id
     AND peer.created_by_user_id = po.user_id
     AND peer.amount = po.amount
     AND peer.category = po.category
    WHERE po.contact_user_id IS NOT NULL
  ),
  all_obligation_ids AS (
    SELECT id FROM source_obligations
    UNION
    SELECT counterparty_obligation_id
    FROM source_obligations
    WHERE counterparty_obligation_id IS NOT NULL
    UNION
    SELECT peer.id
    FROM source_obligations po
    JOIN personal_obligations peer
      ON peer.relationship_id = po.relationship_id
    WHERE po.relationship_id IS NOT NULL
    UNION
    SELECT id FROM inverse_obligations
  ),
  relationship_ids AS (
    SELECT relationship_id
    FROM source_obligations
    WHERE relationship_id IS NOT NULL
  ),
  settled_obligations AS (
    SELECT
      NULL::uuid AS settlement_id,
      id AS obligation_id,
      status,
      'settled_obligation'::text AS activity_reason,
      now() AS sort_at
    FROM source_obligations
    WHERE status = 'settled'
  ),
  directly_linked_settlements AS (
    SELECT pos.*
    FROM personal_obligation_settlements pos
    WHERE pos.obligation_id IN (SELECT id FROM all_obligation_ids)
       OR pos.relationship_id IN (SELECT relationship_id FROM relationship_ids)
  ),
  blocking_settlements AS (
    SELECT
      pos.id AS settlement_id,
      pos.obligation_id,
      pos.status,
      CASE
        WHEN pos.status = 'pending_confirmation' THEN 'awaiting_confirmation'
        WHEN pos.status = 'confirmed' THEN 'confirmed_payment'
        WHEN pos.confirmed_at IS NOT NULL THEN 'confirmation_history'
        WHEN COALESCE(pos.confirmed_amount, 0) > 0 THEN 'partial_or_confirmed_payment'
        WHEN COALESCE(pos.account_movement_processed, false) = true THEN 'account_movement_history'
        ELSE 'active_settlement_record'
      END AS activity_reason,
      pos.created_at AS sort_at
    FROM personal_obligation_settlements pos
    WHERE (
      pos.id IN (SELECT id FROM directly_linked_settlements)
      OR pos.counterparty_settlement_id IN (SELECT id FROM directly_linked_settlements)
    )
    AND (
      pos.status = 'pending_confirmation'
      OR pos.status = 'confirmed'
      OR pos.confirmed_at IS NOT NULL
      OR COALESCE(pos.confirmed_amount, 0) > 0
      OR COALESCE(pos.account_movement_processed, false) = true
    )
  )
  SELECT
    settlement_id,
    obligation_id,
    status,
    activity_reason
  FROM (
    SELECT * FROM blocking_settlements
    UNION ALL
    SELECT * FROM settled_obligations
  ) blockers
  ORDER BY sort_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.expense_has_settlement_activity(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_blocking_settlement_activity(p_expense_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.log_and_raise_expense_settlement_delete_block(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block record;
BEGIN
  SELECT * INTO v_block
  FROM public.expense_blocking_settlement_activity(p_expense_id)
  LIMIT 1;

  IF FOUND THEN
    RAISE LOG 'Expense % blocked by Settlement %, Obligation %, Status %, Reason %',
      p_expense_id,
      COALESCE(v_block.settlement_id::text, 'none'),
      v_block.obligation_id,
      v_block.status,
      v_block.activity_reason;

    RAISE EXCEPTION 'This expense cannot be deleted because payment activity already exists.'
      USING DETAIL = format(
        'Expense %s blocked by settlement %s. Status = %s. Reason = %s.',
        p_expense_id,
        COALESCE(v_block.settlement_id::text, 'none'),
        v_block.status,
        v_block.activity_reason
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_debt_linked_expense_delete_with_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.expense_has_settlement_activity(OLD.id) THEN
    PERFORM public.log_and_raise_expense_settlement_delete_block(OLD.id);
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
      OR pos.counterparty_settlement_id IN (
        SELECT id
        FROM personal_obligation_settlements linked_pos
        WHERE linked_pos.obligation_id = OLD.id
           OR linked_pos.obligation_id = OLD.counterparty_obligation_id
           OR (
             OLD.relationship_id IS NOT NULL
             AND linked_pos.relationship_id = OLD.relationship_id
           )
      )
    )
    AND (
      pos.status = 'pending_confirmation'
      OR pos.status = 'confirmed'
      OR pos.confirmed_at IS NOT NULL
      OR COALESCE(pos.confirmed_amount, 0) > 0
      OR COALESCE(pos.account_movement_processed, false) = true
    )
  ) THEN
    RAISE LOG 'Obligation % blocked from deletion because payment activity exists', OLD.id;
    RAISE EXCEPTION 'This expense cannot be deleted because payment activity already exists.';
  END IF;

  RETURN OLD;
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
  IF public.expense_has_settlement_activity(p_expense_id) THEN
    PERFORM public.log_and_raise_expense_settlement_delete_block(p_expense_id);
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
  WHERE id = ANY(v_obligation_ids)
     OR relationship_id = ANY(v_relationship_ids);
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

  IF public.expense_has_settlement_activity(p_expense_id) THEN
    PERFORM public.log_and_raise_expense_settlement_delete_block(p_expense_id);
  END IF;

  PERFORM public.cleanup_unconfirmed_expense_debt(p_expense_id);

  DELETE FROM expenses
  WHERE id = p_expense_id
    AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expense_blocking_settlement_activity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_has_settlement_activity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_and_raise_expense_settlement_delete_block(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expense_safely(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
