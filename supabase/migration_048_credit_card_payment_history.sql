-- ============================================================
-- Migration 048: Credit card payment history
-- Run this in the Supabase SQL editor after migration 047.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.credit_card_payments (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_card_account_id              uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  source_account_id                   uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  transfer_id                         uuid REFERENCES public.account_transfers(id) ON DELETE RESTRICT,
  amount                              numeric(14, 2) NOT NULL CHECK (amount > 0),
  remaining_outstanding_after_payment numeric(14, 2) NOT NULL CHECK (remaining_outstanding_after_payment >= 0),
  paid_at                             timestamptz NOT NULL DEFAULT now(),
  created_at                          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_card_payments_user_idx
  ON public.credit_card_payments(user_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS credit_card_payments_card_idx
  ON public.credit_card_payments(credit_card_account_id, paid_at DESC);

GRANT SELECT, INSERT ON public.credit_card_payments TO authenticated;

ALTER TABLE public.credit_card_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_card_payments_select_own" ON public.credit_card_payments;
DROP POLICY IF EXISTS "credit_card_payments_insert_own" ON public.credit_card_payments;

CREATE POLICY "credit_card_payments_select_own" ON public.credit_card_payments
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "credit_card_payments_insert_own" ON public.credit_card_payments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.record_credit_card_payment(
  p_credit_card_account_id uuid,
  p_source_account_id uuid,
  p_amount numeric,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS credit_card_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_card financial_accounts;
  v_source financial_accounts;
  v_transfer account_transfers;
  v_payment credit_card_payments;
  v_outstanding numeric(14, 2);
  v_remaining numeric(14, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_source_account_id IS NULL THEN RAISE EXCEPTION 'Please select a source account.'; END IF;
  IF p_credit_card_account_id IS NULL THEN RAISE EXCEPTION 'Credit card account is required.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;

  SELECT * INTO v_card
  FROM financial_accounts
  WHERE id = p_credit_card_account_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Credit card account not found'; END IF;
  IF v_card.category != 'liability' OR NOT public.is_credit_card_account_type(v_card.type) THEN
    RAISE EXCEPTION 'Selected account is not a credit card.';
  END IF;

  SELECT * INTO v_source
  FROM financial_accounts
  WHERE id = p_source_account_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Source account not found'; END IF;
  IF v_source.category = 'liability' THEN
    RAISE EXCEPTION 'Please select a source account.';
  END IF;

  v_outstanding := GREATEST(0, -v_card.balance);
  IF p_amount > v_outstanding + 0.005 THEN
    RAISE EXCEPTION 'Payment exceeds outstanding balance.';
  END IF;

  INSERT INTO account_transfers (
    user_id,
    from_account_id,
    to_account_id,
    amount,
    note,
    transferred_at
  )
  VALUES (
    v_uid,
    p_source_account_id,
    p_credit_card_account_id,
    p_amount,
    'Credit card payment - ' || v_card.name,
    COALESCE(p_paid_at, now())
  )
  RETURNING * INTO v_transfer;

  SELECT GREATEST(0, -balance) INTO v_remaining
  FROM financial_accounts
  WHERE id = p_credit_card_account_id
    AND user_id = v_uid;

  INSERT INTO credit_card_payments (
    user_id,
    credit_card_account_id,
    source_account_id,
    transfer_id,
    amount,
    remaining_outstanding_after_payment,
    paid_at
  )
  VALUES (
    v_uid,
    p_credit_card_account_id,
    p_source_account_id,
    v_transfer.id,
    p_amount,
    v_remaining,
    COALESCE(p_paid_at, now())
  )
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_credit_card_payment(uuid, uuid, numeric, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
