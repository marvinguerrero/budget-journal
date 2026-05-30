-- ============================================================
-- Migration 037: Require financial accounts for payments
-- Run this in the Supabase SQL editor after migration 036.
-- ============================================================

CREATE OR REPLACE FUNCTION public.require_shared_settlement_source_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending_confirmation' AND NEW.payer_account_id IS NULL THEN
    RAISE EXCEPTION 'Please select a source account.';
  END IF;

  IF NEW.status = 'confirmed' AND NEW.payer_account_id IS NULL THEN
    RAISE EXCEPTION 'Please select a source account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_shared_settlement_source_account ON public.shared_expense_settlements;
CREATE TRIGGER trg_require_shared_settlement_source_account
  BEFORE INSERT OR UPDATE ON public.shared_expense_settlements
  FOR EACH ROW EXECUTE FUNCTION public.require_shared_settlement_source_account();

CREATE OR REPLACE FUNCTION public.require_personal_settlement_source_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obligation personal_obligations;
  v_linked personal_obligation_settlements;
BEGIN
  IF NEW.status IN ('pending_confirmation', 'confirmed') THEN
    SELECT * INTO v_obligation
    FROM personal_obligations
    WHERE id = NEW.obligation_id;

    IF FOUND AND v_obligation.direction = 'user_owes' AND NEW.payer_account_id IS NULL THEN
      RAISE EXCEPTION 'Please select a source account.';
    END IF;

    IF FOUND
       AND v_obligation.direction = 'owed_to_user'
       AND NEW.counterparty_settlement_id IS NOT NULL THEN
      SELECT * INTO v_linked
      FROM personal_obligation_settlements
      WHERE id = NEW.counterparty_settlement_id;

      IF FOUND AND v_linked.payer_account_id IS NULL THEN
        RAISE EXCEPTION 'Please select a source account.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_personal_settlement_source_account ON public.personal_obligation_settlements;
CREATE TRIGGER trg_require_personal_settlement_source_account
  BEFORE INSERT OR UPDATE ON public.personal_obligation_settlements
  FOR EACH ROW EXECUTE FUNCTION public.require_personal_settlement_source_account();

CREATE OR REPLACE FUNCTION public.require_shared_expense_source_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_by_user_id = NEW.user_id
     AND NEW.payment_source_status = 'confirmed'
     AND NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'Please select a source account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_shared_expense_source_account ON public.shared_expenses;
CREATE TRIGGER trg_require_shared_expense_source_account
  BEFORE INSERT OR UPDATE ON public.shared_expenses
  FOR EACH ROW EXECUTE FUNCTION public.require_shared_expense_source_account();

DROP FUNCTION IF EXISTS public.confirm_payment_source(uuid, uuid);
CREATE OR REPLACE FUNCTION public.confirm_payment_source(p_expense_id uuid, p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'Please select a source account.'; END IF;

  UPDATE shared_expenses
    SET account_id = p_account_id,
        payment_source_status = 'confirmed'
    WHERE id = p_expense_id
      AND paid_by_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment source not found';
  END IF;
END;
$$;

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
  IF v_s.payer_account_id IS NULL THEN
    RAISE EXCEPTION 'Please select a source account.';
  END IF;
  IF p_receiver_account_id IS NULL THEN
    RAISE EXCEPTION 'Please select a destination account.';
  END IF;

  v_requested_amount := COALESCE(v_s.original_amount, v_s.amount);
  v_amount := COALESCE(p_amount, v_s.amount);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;
  IF v_amount > v_s.amount + 0.005 THEN
    RAISE EXCEPTION 'Settlement amount cannot exceed the remaining balance';
  END IF;

  UPDATE financial_accounts
    SET balance = balance - v_amount
    WHERE id = v_s.payer_account_id
      AND user_id = v_s.payer_user_id;

  UPDATE financial_accounts
    SET balance = balance + v_amount
    WHERE id = p_receiver_account_id
      AND user_id = v_s.receiver_user_id;

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

DROP FUNCTION IF EXISTS public.apply_personal_obligation_payment(uuid, numeric, uuid);
DROP FUNCTION IF EXISTS public.apply_personal_obligation_payment(uuid, numeric, uuid, text);
CREATE OR REPLACE FUNCTION public.apply_personal_obligation_payment(
  p_obligation_id uuid,
  p_amount numeric,
  p_account_id uuid,
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
  v_counterparty personal_obligations;
  v_settlement personal_obligation_settlements;
  v_counterparty_settlement personal_obligation_settlements;
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'Please select a source account.'; END IF;

  SELECT * INTO v_obligation
  FROM personal_obligations
  WHERE id = p_obligation_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation not found'; END IF;
  IF v_obligation.status = 'settled' THEN RAISE EXCEPTION 'Obligation is already settled'; END IF;
  IF v_obligation.direction != 'user_owes' THEN
    RAISE EXCEPTION 'Receivable payments must be recorded with the received-payment workflow';
  END IF;

  v_amount := LEAST(p_amount, v_obligation.remaining_amount);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Invalid settlement amount'; END IF;

  INSERT INTO personal_obligation_settlements (
    obligation_id,
    user_id,
    amount,
    original_amount,
    payer_account_id,
    status,
    note,
    relationship_id
  )
  VALUES (
    p_obligation_id,
    v_uid,
    v_amount,
    v_amount,
    p_account_id,
    'pending_confirmation',
    COALESCE(p_note, ''),
    v_obligation.relationship_id
  )
  RETURNING * INTO v_settlement;

  IF v_obligation.counterparty_obligation_id IS NOT NULL THEN
    SELECT * INTO v_counterparty
    FROM personal_obligations
    WHERE id = v_obligation.counterparty_obligation_id
    FOR UPDATE;

    IF FOUND THEN
      INSERT INTO personal_obligation_settlements (
        obligation_id,
        user_id,
        amount,
        original_amount,
        status,
        note,
        relationship_id,
        counterparty_settlement_id
      )
      VALUES (
        v_counterparty.id,
        v_counterparty.user_id,
        v_amount,
        v_amount,
        'pending_confirmation',
        COALESCE(p_note, ''),
        v_obligation.relationship_id,
        v_settlement.id
      )
      RETURNING * INTO v_counterparty_settlement;

      UPDATE personal_obligation_settlements
        SET counterparty_settlement_id = v_counterparty_settlement.id
        WHERE id = v_settlement.id;

      INSERT INTO notifications (user_id, type, title, message, related_id)
      VALUES (
        v_counterparty.user_id,
        'settlement_received',
        'Payment awaiting confirmation',
        v_obligation.contact_name || ' marked PHP ' || trim(to_char(v_amount, 'FM999G999G999G990D00')) || ' as paid.',
        v_counterparty_settlement.id
      );
    END IF;
  END IF;

  RETURN v_settlement;
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
  v_payer_settlement personal_obligation_settlements;
  v_receiver_settlement personal_obligation_settlements;
  v_obligation personal_obligations;
  v_counterparty personal_obligations;
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_receiver_account_id IS NULL THEN RAISE EXCEPTION 'Please select a destination account.'; END IF;

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

  SELECT * INTO v_obligation
  FROM personal_obligations
  WHERE id = v_settlement.obligation_id
  FOR UPDATE;

  IF v_obligation.counterparty_obligation_id IS NOT NULL
     AND v_obligation.direction = 'user_owes' THEN
    RAISE EXCEPTION 'Only the receiver can confirm this settlement';
  END IF;

  v_receiver_settlement := v_settlement;
  v_payer_settlement := v_settlement;

  IF v_settlement.counterparty_settlement_id IS NOT NULL THEN
    SELECT * INTO v_payer_settlement
    FROM personal_obligation_settlements
    WHERE id = v_settlement.counterparty_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Linked settlement not found'; END IF;

    IF v_obligation.direction = 'user_owes' THEN
      v_receiver_settlement := v_payer_settlement;
      v_payer_settlement := v_settlement;
    END IF;
  END IF;

  IF v_payer_settlement.payer_account_id IS NULL THEN
    RAISE EXCEPTION 'Please select a source account.';
  END IF;

  v_amount := COALESCE(p_amount, v_receiver_settlement.amount);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;
  IF v_amount > v_receiver_settlement.amount + 0.005 THEN
    RAISE EXCEPTION 'Settlement amount cannot exceed the remaining balance';
  END IF;

  UPDATE financial_accounts
    SET balance = balance - v_amount
    WHERE id = v_payer_settlement.payer_account_id
      AND user_id = v_payer_settlement.user_id;

  UPDATE financial_accounts
    SET balance = balance + v_amount
    WHERE id = p_receiver_account_id
      AND user_id = v_receiver_settlement.user_id;

  UPDATE personal_obligation_settlements
    SET amount = v_amount,
        confirmed_amount = v_amount,
        receiver_account_id = CASE WHEN id = v_receiver_settlement.id THEN p_receiver_account_id ELSE receiver_account_id END,
        status = 'confirmed',
        confirmed_at = now(),
        confirmed_by_user_id = v_uid,
        confirmation_reversed_at = NULL,
        account_movement_processed = true,
        account_movement_processed_at = now()
    WHERE id IN (v_receiver_settlement.id, v_payer_settlement.id);

  UPDATE personal_obligations
    SET remaining_amount = GREATEST(0, remaining_amount - v_amount),
        status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE NULL END
    WHERE id = v_receiver_settlement.obligation_id;

  SELECT * INTO v_counterparty
  FROM personal_obligations
  WHERE id = v_payer_settlement.obligation_id
  FOR UPDATE;

  IF FOUND AND v_counterparty.id != v_receiver_settlement.obligation_id THEN
    UPDATE personal_obligations
      SET remaining_amount = GREATEST(0, remaining_amount - v_amount),
          status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
          settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE NULL END
      WHERE id = v_counterparty.id;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.record_external_personal_obligation_payment(uuid, numeric, uuid);
DROP FUNCTION IF EXISTS public.record_external_personal_obligation_payment(uuid, numeric, uuid, text);
CREATE OR REPLACE FUNCTION public.record_external_personal_obligation_payment(
  p_obligation_id uuid,
  p_amount numeric,
  p_account_id uuid,
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
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'Please select a source account.'; END IF;

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
    UPDATE financial_accounts
      SET balance = balance - v_amount
      WHERE id = p_account_id
        AND user_id = v_uid;

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
    UPDATE financial_accounts
      SET balance = balance + v_amount
      WHERE id = p_account_id
        AND user_id = v_uid;

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

GRANT EXECUTE ON FUNCTION public.confirm_payment_source(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_settlement(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_personal_obligation_payment(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_personal_obligation_payment(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_external_personal_obligation_payment(uuid, numeric, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
