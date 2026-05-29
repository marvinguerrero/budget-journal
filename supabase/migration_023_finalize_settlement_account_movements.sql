-- ============================================================
-- Migration 023: Finalize settlement account movement on confirm
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Account movement now happens only when a settlement is confirmed.
-- Pending/awaiting settlements store selected accounts but do not affect balances.

ALTER TABLE public.shared_expense_settlements
  ADD COLUMN IF NOT EXISTS payer_account_label text,
  ADD COLUMN IF NOT EXISTS receiver_account_label text;

CREATE OR REPLACE FUNCTION public.account_label(p_account_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(emoji || ' ' || name, name)
  FROM financial_accounts
  WHERE id = p_account_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.confirm_settlement(
  p_settlement_id uuid,
  p_receiver_account_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s shared_expense_settlements;
BEGIN
  SELECT * INTO v_s FROM shared_expense_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_s.receiver_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the receiver can confirm this settlement';
  END IF;
  IF v_s.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Settlement has already been processed';
  END IF;

  IF v_s.payer_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance - v_s.amount
      WHERE id = v_s.payer_account_id
        AND user_id = v_s.payer_user_id;
  END IF;

  IF p_receiver_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance + v_s.amount
      WHERE id = p_receiver_account_id
        AND user_id = v_s.receiver_user_id;
  END IF;

  UPDATE shared_expense_settlements
    SET status = 'confirmed',
        confirmed_at = now(),
        confirmed_by_user_id = auth.uid(),
        confirmation_reversed_at = NULL,
        receiver_account_id = p_receiver_account_id,
        payer_account_label = public.account_label(v_s.payer_account_id),
        receiver_account_label = public.account_label(p_receiver_account_id)
    WHERE id = p_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_confirm_settlement(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s shared_expense_settlements;
BEGIN
  SELECT * INTO v_s FROM shared_expense_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_s.status != 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed settlements can be reversed';
  END IF;
  IF v_s.confirmed_by_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the user who confirmed this payment can undo it';
  END IF;

  IF v_s.payer_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance + v_s.amount
      WHERE id = v_s.payer_account_id
        AND user_id = v_s.payer_user_id;
  END IF;

  IF v_s.receiver_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance - v_s.amount
      WHERE id = v_s.receiver_account_id
        AND user_id = v_s.receiver_user_id;
  END IF;

  IF v_s.income_entry_id IS NOT NULL THEN
    DELETE FROM income_entries WHERE id = v_s.income_entry_id;
  END IF;

  UPDATE shared_expense_settlements
    SET status = 'pending_confirmation',
        confirmed_at = NULL,
        confirmed_by_user_id = NULL,
        income_entry_id = NULL,
        receiver_account_id = NULL,
        confirmation_reversed_at = now()
    WHERE id = p_settlement_id;
END;
$$;

-- Personal settlements -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_personal_obligation_payment(
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
  v_settlement personal_obligation_settlements;
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_obligation
  FROM personal_obligations
  WHERE id = p_obligation_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation not found'; END IF;
  IF v_obligation.status = 'settled' THEN RAISE EXCEPTION 'Obligation is already settled'; END IF;

  v_amount := LEAST(p_amount, v_obligation.remaining_amount);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Invalid settlement amount'; END IF;

  IF v_obligation.direction = 'user_owes' THEN
    INSERT INTO personal_obligation_settlements (
      obligation_id, user_id, amount, payer_account_id, status, note
    )
    VALUES (
      p_obligation_id, v_uid, v_amount, p_account_id, 'pending_confirmation', COALESCE(p_note, '')
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
      obligation_id, user_id, amount, receiver_account_id, status, note, confirmed_at, confirmed_by_user_id
    )
    VALUES (
      p_obligation_id, v_uid, v_amount, p_account_id, 'confirmed', COALESCE(p_note, ''), now(), v_uid
    )
    RETURNING * INTO v_settlement;

    UPDATE personal_obligations
      SET remaining_amount = remaining_amount - v_amount,
          status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
          settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE settled_at END
      WHERE id = p_obligation_id
        AND user_id = v_uid;
  END IF;

  RETURN v_settlement;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_personal_obligation_payment(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settlement personal_obligation_settlements;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_settlement
  FROM personal_obligation_settlements
  WHERE id = p_settlement_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_settlement.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Only pending settlements can be confirmed';
  END IF;

  IF v_settlement.payer_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance - v_settlement.amount
      WHERE id = v_settlement.payer_account_id
        AND user_id = v_uid;
  END IF;

  IF v_settlement.receiver_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance + v_settlement.amount
      WHERE id = v_settlement.receiver_account_id
        AND user_id = v_uid;
  END IF;

  UPDATE personal_obligation_settlements
    SET status = 'confirmed',
        confirmed_at = now(),
        confirmed_by_user_id = v_uid,
        confirmation_reversed_at = NULL
    WHERE id = p_settlement_id
      AND user_id = v_uid;

  UPDATE personal_obligations
    SET remaining_amount = GREATEST(0, remaining_amount - v_settlement.amount),
        status = CASE WHEN remaining_amount - v_settlement.amount <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN remaining_amount - v_settlement.amount <= 0.005 THEN now() ELSE settled_at END
    WHERE id = v_settlement.obligation_id
      AND user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_confirm_personal_obligation_payment(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settlement personal_obligation_settlements;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_settlement
  FROM personal_obligation_settlements
  WHERE id = p_settlement_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_settlement.status != 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed settlements can be reversed';
  END IF;
  IF v_settlement.confirmed_by_user_id != v_uid THEN
    RAISE EXCEPTION 'Only the user who confirmed this payment can undo it';
  END IF;

  IF v_settlement.payer_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance + v_settlement.amount
      WHERE id = v_settlement.payer_account_id
        AND user_id = v_uid;
  END IF;

  IF v_settlement.receiver_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance - v_settlement.amount
      WHERE id = v_settlement.receiver_account_id
        AND user_id = v_uid;
  END IF;

  UPDATE personal_obligations
    SET remaining_amount = remaining_amount + v_settlement.amount,
        status = 'open',
        settled_at = NULL
    WHERE id = v_settlement.obligation_id
      AND user_id = v_uid;

  UPDATE personal_obligation_settlements
    SET status = 'pending_confirmation',
        confirmed_at = NULL,
        confirmed_by_user_id = NULL,
        confirmation_reversed_at = now()
    WHERE id = p_settlement_id
      AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.account_label(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_settlement(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_confirm_settlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_personal_obligation_payment(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_personal_obligation_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_confirm_personal_obligation_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
