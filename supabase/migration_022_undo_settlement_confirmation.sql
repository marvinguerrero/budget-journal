-- ============================================================
-- Migration 022: Undo settlement confirmation
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Shared settlements ---------------------------------------------------------

ALTER TABLE public.shared_expense_settlements
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmation_reversed_at timestamptz;

UPDATE public.shared_expense_settlements
  SET confirmed_by_user_id = receiver_user_id
  WHERE status = 'confirmed'
    AND confirmed_by_user_id IS NULL;

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
  v_src_id uuid;
  v_inc_id uuid;
BEGIN
  SELECT * INTO v_s FROM shared_expense_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_s.receiver_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the receiver can confirm this settlement';
  END IF;
  IF v_s.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Settlement has already been processed';
  END IF;

  UPDATE shared_expense_settlements
    SET status = 'confirmed',
        confirmed_at = now(),
        confirmed_by_user_id = auth.uid(),
        confirmation_reversed_at = NULL,
        receiver_account_id = p_receiver_account_id
    WHERE id = p_settlement_id;

  IF p_receiver_account_id IS NOT NULL THEN
    SELECT id INTO v_src_id
    FROM income_sources
    WHERE lower(name) = 'settlement'
      AND user_id IS NULL
    LIMIT 1;

    INSERT INTO income_entries
      (user_id, income_source_id, account_id, amount, note, status, received_at)
    VALUES (
      v_s.receiver_user_id,
      v_src_id,
      p_receiver_account_id,
      v_s.amount,
      'Settlement from ' || split_part(v_s.payer_email, '@', 1),
      'received',
      now()
    )
    RETURNING id INTO v_inc_id;

    UPDATE shared_expense_settlements
      SET income_entry_id = v_inc_id
      WHERE id = p_settlement_id;
  END IF;
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

  IF v_s.income_entry_id IS NOT NULL THEN
    DELETE FROM income_entries WHERE id = v_s.income_entry_id;
  END IF;

  UPDATE shared_expense_settlements
    SET status = 'pending_confirmation',
        confirmed_at = NULL,
        confirmed_by_user_id = NULL,
        income_entry_id = NULL,
        confirmation_reversed_at = now()
    WHERE id = p_settlement_id;
END;
$$;

-- Personal settlements -------------------------------------------------------

ALTER TABLE public.personal_obligation_settlements
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmation_reversed_at timestamptz;

UPDATE public.personal_obligation_settlements
  SET confirmed_by_user_id = user_id
  WHERE status = 'confirmed'
    AND confirmed_by_user_id IS NULL;

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

GRANT EXECUTE ON FUNCTION public.confirm_settlement(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_confirm_settlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_personal_obligation_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_confirm_personal_obligation_payment(uuid) TO authenticated;

-- Make newly created/changed RPCs visible to Supabase PostgREST immediately.
NOTIFY pgrst, 'reload schema';
