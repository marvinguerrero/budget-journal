-- ============================================================
-- Migration 028: External contact direct settlement
-- Run this in the Supabase SQL editor after migration 027.
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_external_personal_obligation_payment(
  p_obligation_id uuid,
  p_amount numeric,
  p_account_id uuid DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS personal_obligation_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_obligation personal_obligations;
  v_contact contacts;
  v_settlement personal_obligation_settlements;
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_obligation
  FROM personal_obligations
  WHERE id = p_obligation_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation not found'; END IF;
  IF v_obligation.status = 'settled' THEN RAISE EXCEPTION 'Obligation is already settled'; END IF;

  IF v_obligation.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact
    FROM contacts
    WHERE id = v_obligation.contact_id
      AND user_id = v_uid;

    IF FOUND AND v_contact.contact_type != 'external' THEN
      RAISE EXCEPTION 'Registered contacts must use the confirmation workflow';
    END IF;
  ELSIF v_obligation.contact_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Registered contacts must use the confirmation workflow';
  END IF;

  v_amount := LEAST(p_amount, v_obligation.remaining_amount);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Settlement amount must be greater than zero'; END IF;

  IF v_obligation.direction = 'user_owes' THEN
    IF p_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance - v_amount
        WHERE id = p_account_id
          AND user_id = v_uid;
    END IF;

    INSERT INTO personal_obligation_settlements (
      obligation_id,
      user_id,
      amount,
      original_amount,
      confirmed_amount,
      payer_account_id,
      status,
      note,
      confirmed_at,
      confirmed_by_user_id,
      account_movement_processed,
      account_movement_processed_at
    )
    VALUES (
      p_obligation_id,
      v_uid,
      v_amount,
      v_amount,
      v_amount,
      p_account_id,
      'confirmed',
      COALESCE(p_note, ''),
      now(),
      v_uid,
      true,
      now()
    )
    RETURNING * INTO v_settlement;
  ELSE
    IF p_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance + v_amount
        WHERE id = p_account_id
          AND user_id = v_uid;
    END IF;

    INSERT INTO personal_obligation_settlements (
      obligation_id,
      user_id,
      amount,
      original_amount,
      confirmed_amount,
      receiver_account_id,
      status,
      note,
      confirmed_at,
      confirmed_by_user_id,
      account_movement_processed,
      account_movement_processed_at
    )
    VALUES (
      p_obligation_id,
      v_uid,
      v_amount,
      v_amount,
      v_amount,
      p_account_id,
      'confirmed',
      COALESCE(p_note, ''),
      now(),
      v_uid,
      true,
      now()
    )
    RETURNING * INTO v_settlement;
  END IF;

  UPDATE personal_obligations
    SET remaining_amount = GREATEST(0, remaining_amount - v_amount),
        status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE NULL END
    WHERE id = p_obligation_id
      AND user_id = v_uid;

  RETURN v_settlement;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_external_personal_obligation_payment(uuid, numeric, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
