-- ============================================================
-- Migration 059: Create expense history when I Owe balances are paid
-- Run this in the Supabase SQL editor after migration 058.
-- ============================================================

ALTER TABLE public.personal_obligation_settlements
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_personal_obligation_settlements_expense
  ON public.personal_obligation_settlements(expense_id)
  WHERE expense_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_personal_payable_expense(
  p_obligation_id uuid,
  p_settlement_id uuid,
  p_amount numeric,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obligation public.personal_obligations;
  v_existing_expense_id uuid;
  v_expense_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than zero.';
  END IF;

  SELECT expense_id INTO v_existing_expense_id
  FROM public.personal_obligation_settlements
  WHERE id = p_settlement_id;

  IF v_existing_expense_id IS NOT NULL THEN
    RETURN v_existing_expense_id;
  END IF;

  SELECT * INTO v_obligation
  FROM public.personal_obligations
  WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obligation not found.';
  END IF;

  IF v_obligation.direction != 'user_owes' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.expenses (
    user_id,
    amount,
    category,
    note,
    account_id,
    created_at
  )
  VALUES (
    v_obligation.user_id,
    p_amount,
    v_obligation.category,
    COALESCE(NULLIF(v_obligation.note, ''), 'Paid ' || v_obligation.contact_name),
    NULL,
    COALESCE(p_paid_at, now())
  )
  RETURNING id INTO v_expense_id;

  UPDATE public.personal_obligation_settlements
  SET expense_id = v_expense_id
  WHERE id = p_settlement_id
    AND expense_id IS NULL;

  RETURN v_expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_external_personal_obligation_payment(
  p_obligation_id uuid,
  p_amount numeric,
  p_account_id uuid DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS public.personal_obligation_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_obligation public.personal_obligations;
  v_contact public.contacts;
  v_settlement public.personal_obligation_settlements;
  v_amount numeric(12, 2);
  v_expense_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_obligation
  FROM public.personal_obligations
  WHERE id = p_obligation_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation not found'; END IF;
  IF v_obligation.status = 'settled' THEN RAISE EXCEPTION 'Obligation is already settled'; END IF;

  IF v_obligation.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact
    FROM public.contacts
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
      UPDATE public.financial_accounts
        SET balance = balance - v_amount
        WHERE id = p_account_id
          AND user_id = v_uid;
    END IF;

    INSERT INTO public.personal_obligation_settlements (
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

    v_expense_id := public.create_personal_payable_expense(
      p_obligation_id,
      v_settlement.id,
      v_amount,
      v_settlement.confirmed_at
    );

    SELECT * INTO v_settlement
    FROM public.personal_obligation_settlements
    WHERE id = v_settlement.id;
  ELSE
    IF p_account_id IS NOT NULL THEN
      UPDATE public.financial_accounts
        SET balance = balance + v_amount
        WHERE id = p_account_id
          AND user_id = v_uid;
    END IF;

    INSERT INTO public.personal_obligation_settlements (
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

  UPDATE public.personal_obligations
    SET remaining_amount = GREATEST(0, remaining_amount - v_amount),
        status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE NULL END
    WHERE id = p_obligation_id
      AND user_id = v_uid;

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
  v_settlement public.personal_obligation_settlements;
  v_payer_settlement public.personal_obligation_settlements;
  v_receiver_settlement public.personal_obligation_settlements;
  v_obligation public.personal_obligations;
  v_counterparty public.personal_obligations;
  v_payer_obligation public.personal_obligations;
  v_payer_contact public.contacts;
  v_amount numeric(12, 2);
  v_external_payer boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_receiver_account_id IS NULL THEN RAISE EXCEPTION 'Please select a destination account.'; END IF;

  SELECT * INTO v_settlement
  FROM public.personal_obligation_settlements
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
  FROM public.personal_obligations
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
    FROM public.personal_obligation_settlements
    WHERE id = v_settlement.counterparty_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Linked settlement not found'; END IF;

    IF v_obligation.direction = 'user_owes' THEN
      v_receiver_settlement := v_payer_settlement;
      v_payer_settlement := v_settlement;
    END IF;
  END IF;

  SELECT * INTO v_payer_obligation
  FROM public.personal_obligations
  WHERE id = v_payer_settlement.obligation_id;

  IF FOUND THEN
    IF v_payer_obligation.contact_id IS NOT NULL THEN
      SELECT * INTO v_payer_contact
      FROM public.contacts
      WHERE id = v_payer_obligation.contact_id;
    END IF;

    v_external_payer :=
      v_payer_obligation.contact_user_id IS NULL
      AND (
        v_payer_obligation.contact_id IS NULL
        OR COALESCE(v_payer_contact.contact_type, 'external') = 'external'
      );
  END IF;

  IF v_payer_settlement.payer_account_id IS NULL AND NOT v_external_payer THEN
    RAISE EXCEPTION 'Please select a source account.';
  END IF;

  v_amount := COALESCE(p_amount, v_receiver_settlement.amount);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;
  IF v_amount > v_receiver_settlement.amount + 0.005 THEN
    RAISE EXCEPTION 'Settlement amount cannot exceed the remaining balance';
  END IF;

  IF v_payer_settlement.payer_account_id IS NOT NULL THEN
    UPDATE public.financial_accounts
      SET balance = balance - v_amount
      WHERE id = v_payer_settlement.payer_account_id
        AND user_id = v_payer_settlement.user_id;
  END IF;

  UPDATE public.financial_accounts
    SET balance = balance + v_amount
    WHERE id = p_receiver_account_id
      AND user_id = v_receiver_settlement.user_id;

  UPDATE public.personal_obligation_settlements
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

  IF v_payer_obligation.direction = 'user_owes' THEN
    PERFORM public.create_personal_payable_expense(
      v_payer_obligation.id,
      v_payer_settlement.id,
      v_amount,
      now()
    );
  END IF;

  UPDATE public.personal_obligations
    SET remaining_amount = GREATEST(0, remaining_amount - v_amount),
        status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE NULL END
    WHERE id = v_receiver_settlement.obligation_id;

  SELECT * INTO v_counterparty
  FROM public.personal_obligations
  WHERE id = v_payer_settlement.obligation_id
  FOR UPDATE;

  IF FOUND AND v_counterparty.id != v_receiver_settlement.obligation_id THEN
    UPDATE public.personal_obligations
      SET remaining_amount = GREATEST(0, remaining_amount - v_amount),
          status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
          settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE NULL END
      WHERE id = v_counterparty.id;
  END IF;
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
  v_settlement public.personal_obligation_settlements;
  v_linked public.personal_obligation_settlements;
  v_payer_settlement public.personal_obligation_settlements;
  v_receiver_settlement public.personal_obligation_settlements;
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_settlement
  FROM public.personal_obligation_settlements
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

  v_receiver_settlement := v_settlement;
  v_payer_settlement := v_settlement;

  IF v_settlement.counterparty_settlement_id IS NOT NULL THEN
    SELECT * INTO v_linked
    FROM public.personal_obligation_settlements
    WHERE id = v_settlement.counterparty_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Linked settlement not found'; END IF;

    IF v_settlement.receiver_account_id IS NOT NULL THEN
      v_receiver_settlement := v_settlement;
      v_payer_settlement := v_linked;
    ELSE
      v_receiver_settlement := v_linked;
      v_payer_settlement := v_settlement;
    END IF;
  END IF;

  v_amount := COALESCE(v_receiver_settlement.confirmed_amount, v_receiver_settlement.amount);

  IF v_receiver_settlement.account_movement_processed THEN
    IF v_payer_settlement.payer_account_id IS NOT NULL THEN
      UPDATE public.financial_accounts
        SET balance = balance + v_amount
        WHERE id = v_payer_settlement.payer_account_id
          AND user_id = v_payer_settlement.user_id;
    END IF;

    IF v_receiver_settlement.receiver_account_id IS NOT NULL THEN
      UPDATE public.financial_accounts
        SET balance = balance - v_amount
        WHERE id = v_receiver_settlement.receiver_account_id
          AND user_id = v_receiver_settlement.user_id;
    END IF;

    UPDATE public.personal_obligations
      SET remaining_amount = remaining_amount + v_amount,
          status = 'open',
          settled_at = NULL
      WHERE id IN (v_receiver_settlement.obligation_id, v_payer_settlement.obligation_id);
  END IF;

  IF v_payer_settlement.expense_id IS NOT NULL THEN
    DELETE FROM public.expenses
    WHERE id = v_payer_settlement.expense_id
      AND user_id = v_payer_settlement.user_id;
  END IF;

  UPDATE public.personal_obligation_settlements
    SET amount = v_amount,
        confirmed_amount = NULL,
        status = 'pending_confirmation',
        confirmed_at = NULL,
        confirmed_by_user_id = NULL,
        account_movement_processed = false,
        account_movement_processed_at = NULL,
        confirmation_reversed_at = now(),
        expense_id = NULL
    WHERE id IN (v_receiver_settlement.id, v_payer_settlement.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_personal_payable_expense(uuid, uuid, numeric, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_external_personal_obligation_payment(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_personal_obligation_payment(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_confirm_personal_obligation_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
