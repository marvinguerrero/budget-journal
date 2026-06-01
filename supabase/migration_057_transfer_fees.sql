-- ============================================================
-- Migration 057: Account transfer fees
-- Run this in the Supabase SQL editor after migration 056.
-- ============================================================

ALTER TABLE public.account_transfers
  ADD COLUMN IF NOT EXISTS transfer_fee numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (transfer_fee >= 0);

ALTER TABLE public.account_transfers
  ADD COLUMN IF NOT EXISTS fee_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_account_transfers_fee_expense
  ON public.account_transfers(fee_expense_id)
  WHERE fee_expense_id IS NOT NULL;

INSERT INTO public.categories (user_id, name, icon, color, is_default)
SELECT NULL, 'Transfer Fees', '🏦', '#6366F1', TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories
  WHERE user_id IS NULL
    AND name = 'Transfer Fees'
);

DROP FUNCTION IF EXISTS public.create_account_transfer_with_fee(uuid, uuid, numeric, text, timestamptz, numeric);
CREATE OR REPLACE FUNCTION public.create_account_transfer_with_fee(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_note text DEFAULT '',
  p_transferred_at timestamptz DEFAULT now(),
  p_transfer_fee numeric DEFAULT 0
)
RETURNS public.account_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_from_account financial_accounts;
  v_to_account financial_accounts;
  v_transfer account_transfers;
  v_fee_expense_id uuid;
  v_transfer_fee numeric(14, 2) := COALESCE(p_transfer_fee, 0);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_from_account_id IS NULL THEN RAISE EXCEPTION 'Source account is required.'; END IF;
  IF p_to_account_id IS NULL THEN RAISE EXCEPTION 'Destination account is required.'; END IF;
  IF p_from_account_id = p_to_account_id THEN RAISE EXCEPTION 'Source and destination accounts must be different.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Transfer amount must be greater than zero.'; END IF;
  IF v_transfer_fee < 0 THEN RAISE EXCEPTION 'Transfer fee cannot be negative.'; END IF;

  SELECT * INTO v_from_account
  FROM public.financial_accounts
  WHERE id = p_from_account_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Source account not found.'; END IF;

  SELECT * INTO v_to_account
  FROM public.financial_accounts
  WHERE id = p_to_account_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Destination account not found.'; END IF;

  INSERT INTO public.account_transfers (
    user_id,
    from_account_id,
    to_account_id,
    amount,
    note,
    transferred_at,
    transfer_fee
  )
  VALUES (
    v_uid,
    p_from_account_id,
    p_to_account_id,
    p_amount,
    COALESCE(p_note, ''),
    COALESCE(p_transferred_at, now()),
    v_transfer_fee
  )
  RETURNING * INTO v_transfer;

  IF v_transfer_fee > 0 THEN
    INSERT INTO public.expenses (
      user_id,
      amount,
      category,
      note,
      account_id,
      created_at
    )
    VALUES (
      v_uid,
      v_transfer_fee,
      'Transfer Fees',
      'Transfer Fee - ' || v_from_account.name || ' → ' || v_to_account.name,
      p_from_account_id,
      COALESCE(p_transferred_at, now())
    )
    RETURNING id INTO v_fee_expense_id;

    UPDATE public.account_transfers
    SET fee_expense_id = v_fee_expense_id
    WHERE id = v_transfer.id
    RETURNING * INTO v_transfer;
  END IF;

  RETURN v_transfer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_account_transfer_with_fee(uuid, uuid, numeric, text, timestamptz, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_transfer_fee_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.fee_expense_id IS NOT NULL THEN
    DELETE FROM public.expenses
    WHERE id = OLD.fee_expense_id
      AND user_id = OLD.user_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_transfer_fee_expense ON public.account_transfers;
CREATE TRIGGER trg_delete_transfer_fee_expense
  AFTER DELETE ON public.account_transfers
  FOR EACH ROW EXECUTE FUNCTION public.delete_transfer_fee_expense();

CREATE OR REPLACE FUNCTION public.clear_transfer_fee_when_expense_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.account_transfers
  SET transfer_fee = 0,
      fee_expense_id = NULL
  WHERE fee_expense_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_transfer_fee_when_expense_deleted ON public.expenses;
CREATE TRIGGER trg_clear_transfer_fee_when_expense_deleted
  BEFORE DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.clear_transfer_fee_when_expense_deleted();

CREATE OR REPLACE FUNCTION public.sync_transfer_fee_from_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.account_transfers
  SET transfer_fee = NEW.amount
  WHERE fee_expense_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_transfer_fee_from_expense ON public.expenses;
CREATE TRIGGER trg_sync_transfer_fee_from_expense
  AFTER UPDATE OF amount ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.sync_transfer_fee_from_expense();

NOTIFY pgrst, 'reload schema';
