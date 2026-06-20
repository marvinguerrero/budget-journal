-- ============================================================
-- Migration 066: Allow unmoved itemized debts to be deleted
-- Run this after migration_065.
-- ============================================================
--
-- A line item may create personal obligations when someone else is assigned
-- as owner/payer/shouldered-by. That assignment alone is not settlement
-- movement. Deleting the line item should be allowed until an actual payment
-- flow affects the obligation.

CREATE OR REPLACE FUNCTION public.line_item_has_settlement_activity(p_line_item_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH direct_obligations AS (
    SELECT
      po.id,
      po.status,
      po.amount,
      po.remaining_amount,
      po.counterparty_obligation_id,
      po.relationship_id
    FROM public.personal_obligations po
    WHERE po.source_line_item_id = p_line_item_id
       OR po.id IN (
         SELECT ep.obligation_id
         FROM public.expense_participants ep
         WHERE ep.line_item_id = p_line_item_id
           AND ep.obligation_id IS NOT NULL
       )
  ),
  all_obligations AS (
    SELECT id, status, amount, remaining_amount, relationship_id
    FROM direct_obligations

    UNION

    SELECT peer.id, peer.status, peer.amount, peer.remaining_amount, peer.relationship_id
    FROM public.personal_obligations peer
    WHERE peer.id IN (
      SELECT counterparty_obligation_id
      FROM direct_obligations
      WHERE counterparty_obligation_id IS NOT NULL
    )

    UNION

    SELECT peer.id, peer.status, peer.amount, peer.remaining_amount, peer.relationship_id
    FROM public.personal_obligations peer
    WHERE peer.relationship_id IN (
      SELECT relationship_id
      FROM direct_obligations
      WHERE relationship_id IS NOT NULL
    )
  ),
  relationship_ids AS (
    SELECT relationship_id
    FROM all_obligations
    WHERE relationship_id IS NOT NULL
  ),
  linked_settlements AS (
    SELECT pos.*
    FROM public.personal_obligation_settlements pos
    WHERE pos.obligation_id IN (SELECT id FROM all_obligations)
       OR pos.relationship_id IN (SELECT relationship_id FROM relationship_ids)
       OR pos.counterparty_settlement_id IN (
         SELECT linked_pos.id
         FROM public.personal_obligation_settlements linked_pos
         WHERE linked_pos.obligation_id IN (SELECT id FROM all_obligations)
            OR linked_pos.relationship_id IN (SELECT relationship_id FROM relationship_ids)
       )
  )
  SELECT EXISTS (
    SELECT 1
    FROM all_obligations
    WHERE status = 'settled'
       OR remaining_amount < amount
  )
  OR EXISTS (
    SELECT 1
    FROM linked_settlements
    WHERE status = 'pending_confirmation'
       OR status = 'confirmed'
       OR confirmed_at IS NOT NULL
       OR COALESCE(confirmed_amount, 0) > 0
       OR COALESCE(account_movement_processed, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.cleanup_unmoved_line_item_debt(p_line_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.expense_line_items;
  v_obligation_ids uuid[];
  v_relationship_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT *
  INTO v_item
  FROM public.expense_line_items
  WHERE id = p_line_item_id
    AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Line item not found.';
  END IF;

  IF public.line_item_has_settlement_activity(p_line_item_id) THEN
    RAISE EXCEPTION 'This line item cannot be deleted because settlement movement already exists. Resolve the debt first.';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[])
  INTO v_obligation_ids
  FROM (
    SELECT po.id
    FROM public.personal_obligations po
    WHERE po.source_line_item_id = p_line_item_id

    UNION

    SELECT ep.obligation_id
    FROM public.expense_participants ep
    WHERE ep.line_item_id = p_line_item_id
      AND ep.obligation_id IS NOT NULL

    UNION

    SELECT po.counterparty_obligation_id
    FROM public.personal_obligations po
    WHERE po.source_line_item_id = p_line_item_id
      AND po.counterparty_obligation_id IS NOT NULL

    UNION

    SELECT peer.id
    FROM public.personal_obligations po
    JOIN public.personal_obligations peer
      ON peer.relationship_id = po.relationship_id
    WHERE po.source_line_item_id = p_line_item_id
      AND po.relationship_id IS NOT NULL

    UNION

    SELECT peer.id
    FROM public.expense_participants ep
    JOIN public.personal_obligations po
      ON po.id = ep.obligation_id
    JOIN public.personal_obligations peer
      ON peer.relationship_id = po.relationship_id
    WHERE ep.line_item_id = p_line_item_id
      AND po.relationship_id IS NOT NULL
  ) ids
  WHERE id IS NOT NULL;

  IF COALESCE(array_length(v_obligation_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT relationship_id), ARRAY[]::uuid[])
  INTO v_relationship_ids
  FROM public.personal_obligations
  WHERE id = ANY(v_obligation_ids)
    AND relationship_id IS NOT NULL;

  DELETE FROM public.notifications
  WHERE related_id = ANY(v_obligation_ids);

  UPDATE public.expense_line_items
    SET obligation_id = NULL
    WHERE id = p_line_item_id;

  UPDATE public.expense_participants
    SET obligation_id = NULL
    WHERE line_item_id = p_line_item_id;

  UPDATE public.personal_obligations
    SET counterparty_obligation_id = NULL
    WHERE id = ANY(v_obligation_ids)
       OR counterparty_obligation_id = ANY(v_obligation_ids);

  DELETE FROM public.personal_obligations
  WHERE id = ANY(v_obligation_ids)
     OR relationship_id = ANY(v_relationship_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_expense_line_item_safely(p_line_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.expense_line_items;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT *
  INTO v_item
  FROM public.expense_line_items
  WHERE id = p_line_item_id
    AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Line item not found.';
  END IF;

  PERFORM public.cleanup_unmoved_line_item_debt(p_line_item_id);

  DELETE FROM public.expense_line_items
  WHERE id = p_line_item_id
    AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.line_item_has_settlement_activity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_unmoved_line_item_debt(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_expense_line_item_safely(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
