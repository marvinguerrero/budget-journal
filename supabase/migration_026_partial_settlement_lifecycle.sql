-- ============================================================
-- Migration 026: Preserve partial settlement lifecycle state
-- Run this in the Supabase SQL editor after migration 025.
-- ============================================================

-- Keep the original requested amount and explicit confirmed amount so partial
-- payments have history while the remaining debt stays active.

ALTER TABLE public.shared_expense_settlements
  ADD COLUMN IF NOT EXISTS original_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS confirmed_amount numeric(12, 2);

ALTER TABLE public.personal_obligation_settlements
  ADD COLUMN IF NOT EXISTS original_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS confirmed_amount numeric(12, 2);

UPDATE public.shared_expense_settlements
  SET original_amount = COALESCE(original_amount, amount),
      confirmed_amount = CASE
        WHEN status = 'confirmed' THEN COALESCE(confirmed_amount, amount)
        ELSE confirmed_amount
      END;

UPDATE public.personal_obligation_settlements
  SET original_amount = COALESCE(original_amount, amount),
      confirmed_amount = CASE
        WHEN status = 'confirmed' THEN COALESCE(confirmed_amount, amount)
        ELSE confirmed_amount
      END;

DROP FUNCTION IF EXISTS public.confirm_settlement(uuid, uuid);
DROP FUNCTION IF EXISTS public.confirm_settlement(uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION public.confirm_settlement(
  p_settlement_id uuid,
  p_receiver_account_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s shared_expense_settlements;
  v_requested_amount numeric(12, 2);
  v_amount numeric(12, 2);
BEGIN
  SELECT * INTO v_s
  FROM shared_expense_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_s.receiver_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the receiver can confirm this settlement';
  END IF;
  IF v_s.account_movement_processed THEN
    RETURN;
  END IF;
  IF v_s.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Settlement has already been processed';
  END IF;

  v_requested_amount := COALESCE(v_s.original_amount, v_s.amount);
  v_amount := COALESCE(p_amount, v_s.amount);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;
  IF v_amount > v_s.amount + 0.005 THEN
    RAISE EXCEPTION 'Settlement amount cannot exceed the remaining balance';
  END IF;

  IF v_s.payer_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance - v_amount
      WHERE id = v_s.payer_account_id
        AND user_id = v_s.payer_user_id;
  END IF;

  IF p_receiver_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance + v_amount
      WHERE id = p_receiver_account_id
        AND user_id = v_s.receiver_user_id;
  END IF;

  UPDATE shared_expense_settlements
    SET original_amount = v_requested_amount,
        confirmed_amount = v_amount,
        amount = v_amount,
        status = 'confirmed',
        confirmed_at = now(),
        confirmed_by_user_id = auth.uid(),
        confirmation_reversed_at = NULL,
        receiver_account_id = p_receiver_account_id,
        payer_account_label = public.account_label(v_s.payer_account_id),
        receiver_account_label = public.account_label(p_receiver_account_id),
        account_movement_processed = true,
        account_movement_processed_at = now()
    WHERE id = p_settlement_id;
END;
$$;

DROP FUNCTION IF EXISTS public.confirm_personal_obligation_payment(uuid);
DROP FUNCTION IF EXISTS public.confirm_personal_obligation_payment(uuid, numeric, uuid);

CREATE OR REPLACE FUNCTION public.confirm_personal_obligation_payment(
  p_settlement_id uuid,
  p_amount numeric DEFAULT NULL,
  p_receiver_account_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settlement personal_obligation_settlements;
  v_requested_amount numeric(12, 2);
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_settlement
  FROM personal_obligation_settlements
  WHERE id = p_settlement_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_settlement.account_movement_processed THEN
    RETURN;
  END IF;
  IF v_settlement.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Only pending settlements can be confirmed';
  END IF;

  v_requested_amount := COALESCE(v_settlement.original_amount, v_settlement.amount);
  v_amount := COALESCE(p_amount, v_settlement.amount);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;
  IF v_amount > v_settlement.amount + 0.005 THEN
    RAISE EXCEPTION 'Settlement amount cannot exceed the remaining balance';
  END IF;

  IF v_settlement.payer_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance - v_amount
      WHERE id = v_settlement.payer_account_id
        AND user_id = v_uid;
  END IF;

  IF p_receiver_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance + v_amount
      WHERE id = p_receiver_account_id
        AND user_id = v_uid;
  END IF;

  UPDATE personal_obligation_settlements
    SET original_amount = v_requested_amount,
        confirmed_amount = v_amount,
        amount = v_amount,
        receiver_account_id = p_receiver_account_id,
        status = 'confirmed',
        confirmed_at = now(),
        confirmed_by_user_id = v_uid,
        confirmation_reversed_at = NULL,
        account_movement_processed = true,
        account_movement_processed_at = now()
    WHERE id = p_settlement_id
      AND user_id = v_uid;

  UPDATE personal_obligations
    SET remaining_amount = GREATEST(0, remaining_amount - v_amount),
        status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE NULL END
    WHERE id = v_settlement.obligation_id
      AND user_id = v_uid;
END;
$$;

-- Undo affects only the confirmed amount on that specific settlement.
CREATE OR REPLACE FUNCTION public.undo_confirm_personal_obligation_payment(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settlement personal_obligation_settlements;
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_settlement
  FROM personal_obligation_settlements
  WHERE id = p_settlement_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_settlement.status != 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed settlements can be reversed';
  END IF;
  IF v_settlement.confirmed_by_user_id != v_uid THEN
    RAISE EXCEPTION 'Only the user who confirmed this payment can undo it';
  END IF;

  v_amount := COALESCE(v_settlement.confirmed_amount, v_settlement.amount);

  IF v_settlement.account_movement_processed THEN
    IF v_settlement.payer_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance + v_amount
        WHERE id = v_settlement.payer_account_id
          AND user_id = v_uid;
    END IF;

    IF v_settlement.receiver_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance - v_amount
        WHERE id = v_settlement.receiver_account_id
          AND user_id = v_uid;
    END IF;

    UPDATE personal_obligations
      SET remaining_amount = remaining_amount + v_amount,
          status = 'open',
          settled_at = NULL
      WHERE id = v_settlement.obligation_id
        AND user_id = v_uid;
  END IF;

  UPDATE personal_obligation_settlements
    SET amount = v_amount,
        confirmed_amount = NULL,
        status = 'pending_confirmation',
        confirmed_at = NULL,
        confirmed_by_user_id = NULL,
        account_movement_processed = false,
        account_movement_processed_at = NULL,
        confirmation_reversed_at = now()
    WHERE id = p_settlement_id
      AND user_id = v_uid;
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
  v_amount numeric(12, 2);
BEGIN
  SELECT * INTO v_s
  FROM shared_expense_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_s.status != 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed settlements can be reversed';
  END IF;
  IF v_s.confirmed_by_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the user who confirmed this payment can undo it';
  END IF;

  v_amount := COALESCE(v_s.confirmed_amount, v_s.amount);

  IF v_s.account_movement_processed THEN
    IF v_s.payer_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance + v_amount
        WHERE id = v_s.payer_account_id
          AND user_id = v_s.payer_user_id;
    END IF;

    IF v_s.receiver_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance - v_amount
        WHERE id = v_s.receiver_account_id
          AND user_id = v_s.receiver_user_id;
    END IF;
  END IF;

  IF v_s.income_entry_id IS NOT NULL THEN
    DELETE FROM income_entries WHERE id = v_s.income_entry_id;
  END IF;

  UPDATE shared_expense_settlements
    SET amount = v_amount,
        confirmed_amount = NULL,
        status = 'pending_confirmation',
        confirmed_at = NULL,
        confirmed_by_user_id = NULL,
        income_entry_id = NULL,
        receiver_account_id = NULL,
        account_movement_processed = false,
        account_movement_processed_at = NULL,
        confirmation_reversed_at = now()
    WHERE id = p_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_settlement(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_confirm_settlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_personal_obligation_payment(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_confirm_personal_obligation_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
