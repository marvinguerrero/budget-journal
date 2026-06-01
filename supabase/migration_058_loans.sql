-- ============================================================
-- Migration 058: Loan tracking for Balances
-- Run this in the Supabase SQL editor after migration 057.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.loans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_type          text NOT NULL CHECK (loan_type IN ('money_lent', 'money_borrowed')),
  counterparty_kind  text NOT NULL DEFAULT 'external'
    CHECK (counterparty_kind IN ('registered_user', 'contact', 'external')),
  person_name        text NOT NULL,
  person_email       text,
  person_phone       text,
  contact_id         uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id         uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  principal_amount   numeric(14, 2) NOT NULL CHECK (principal_amount > 0),
  transfer_fee       numeric(14, 2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0),
  fee_responsibility text NOT NULL DEFAULT 'lender'
    CHECK (fee_responsibility IN ('lender', 'borrower')),
  fee_expense_id     uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  amount             numeric(14, 2) NOT NULL CHECK (amount > 0),
  paid_amount        numeric(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_amount   numeric(14, 2) NOT NULL CHECK (remaining_amount >= 0),
  status             text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'partially_paid', 'paid')),
  loan_date          timestamptz NOT NULL DEFAULT now(),
  due_date           date,
  notes              text NOT NULL DEFAULT '',
  interest_rate      numeric(8, 4),
  payment_schedule   text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS counterparty_kind text NOT NULL DEFAULT 'external'
    CHECK (counterparty_kind IN ('registered_user', 'contact', 'external'));

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS person_phone text;

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS principal_amount numeric(14, 2);

UPDATE public.loans
SET principal_amount = amount
WHERE principal_amount IS NULL;

ALTER TABLE public.loans
  ALTER COLUMN principal_amount SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'loans_principal_amount_positive'
      AND conrelid = 'public.loans'::regclass
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT loans_principal_amount_positive CHECK (principal_amount > 0);
  END IF;
END;
$$;

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS transfer_fee numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (transfer_fee >= 0);

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS fee_responsibility text NOT NULL DEFAULT 'lender'
    CHECK (fee_responsibility IN ('lender', 'borrower'));

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS fee_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.loan_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id     uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  amount      numeric(14, 2) NOT NULL CHECK (amount > 0),
  paid_at     timestamptz NOT NULL DEFAULT now(),
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loans_user_status ON public.loans(user_id, status, loan_date DESC);
CREATE INDEX IF NOT EXISTS idx_loans_account ON public.loans(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loans_fee_expense ON public.loans(fee_expense_id) WHERE fee_expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON public.loan_payments(loan_id, paid_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_payments TO authenticated;

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loans_select" ON public.loans;
DROP POLICY IF EXISTS "loans_insert" ON public.loans;
DROP POLICY IF EXISTS "loans_update" ON public.loans;
DROP POLICY IF EXISTS "loans_delete" ON public.loans;

CREATE POLICY "loans_select" ON public.loans
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "loans_insert" ON public.loans
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "loans_update" ON public.loans
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "loans_delete" ON public.loans
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "loan_payments_select" ON public.loan_payments;
DROP POLICY IF EXISTS "loan_payments_insert" ON public.loan_payments;
DROP POLICY IF EXISTS "loan_payments_update" ON public.loan_payments;
DROP POLICY IF EXISTS "loan_payments_delete" ON public.loan_payments;

CREATE POLICY "loan_payments_select" ON public.loan_payments
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "loan_payments_insert" ON public.loan_payments
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_id
        AND l.user_id = (select auth.uid())
    )
  );

CREATE POLICY "loan_payments_update" ON public.loan_payments
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "loan_payments_delete" ON public.loan_payments
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.set_loans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loans_updated_at ON public.loans;
CREATE TRIGGER trg_loans_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_loans_updated_at();

DROP FUNCTION IF EXISTS public.create_loan(text, text, numeric, uuid, timestamptz, date, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.create_loan(text, text, numeric, uuid, timestamptz, date, text, uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.create_loan(text, text, numeric, uuid, timestamptz, date, text, uuid, uuid, text, text, text, numeric, text);
CREATE OR REPLACE FUNCTION public.create_loan(
  p_loan_type text,
  p_person_name text,
  p_amount numeric,
  p_account_id uuid,
  p_loan_date timestamptz DEFAULT now(),
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT '',
  p_contact_id uuid DEFAULT NULL,
  p_contact_user_id uuid DEFAULT NULL,
  p_person_email text DEFAULT NULL,
  p_counterparty_kind text DEFAULT 'external',
  p_person_phone text DEFAULT NULL,
  p_transfer_fee numeric DEFAULT 0,
  p_fee_responsibility text DEFAULT 'lender'
)
RETURNS public.loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_account financial_accounts;
  v_loan loans;
  v_fee_expense_id uuid;
  v_transfer_fee numeric(14, 2) := COALESCE(p_transfer_fee, 0);
  v_fee_responsibility text := COALESCE(p_fee_responsibility, 'lender');
  v_total_amount numeric(14, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_loan_type NOT IN ('money_lent', 'money_borrowed') THEN RAISE EXCEPTION 'Invalid loan type.'; END IF;
  IF COALESCE(p_counterparty_kind, 'external') NOT IN ('registered_user', 'contact', 'external') THEN RAISE EXCEPTION 'Invalid person type.'; END IF;
  IF v_fee_responsibility NOT IN ('lender', 'borrower') THEN RAISE EXCEPTION 'Invalid fee responsibility.'; END IF;
  IF p_person_name IS NULL OR btrim(p_person_name) = '' THEN RAISE EXCEPTION 'Person is required.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Loan amount must be greater than zero.'; END IF;
  IF v_transfer_fee < 0 THEN RAISE EXCEPTION 'Transfer fee cannot be negative.'; END IF;
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'Account is required.'; END IF;

  IF p_counterparty_kind = 'registered_user' AND p_contact_user_id IS NULL THEN
    RAISE EXCEPTION 'Please select a registered user.';
  END IF;

  IF p_counterparty_kind = 'contact' AND p_contact_id IS NULL THEN
    RAISE EXCEPTION 'Please select an existing contact.';
  END IF;

  SELECT * INTO v_account
  FROM public.financial_accounts
  WHERE id = p_account_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found.'; END IF;

  v_total_amount := p_amount + CASE WHEN v_fee_responsibility = 'borrower' THEN v_transfer_fee ELSE 0 END;

  INSERT INTO public.loans (
    user_id,
    loan_type,
    counterparty_kind,
    person_name,
    person_email,
    person_phone,
    contact_id,
    contact_user_id,
    account_id,
    principal_amount,
    transfer_fee,
    fee_responsibility,
    amount,
    paid_amount,
    remaining_amount,
    status,
    loan_date,
    due_date,
    notes
  )
  VALUES (
    v_uid,
    p_loan_type,
    COALESCE(p_counterparty_kind, 'external'),
    btrim(p_person_name),
    NULLIF(btrim(COALESCE(p_person_email, '')), ''),
    NULLIF(btrim(COALESCE(p_person_phone, '')), ''),
    p_contact_id,
    p_contact_user_id,
    p_account_id,
    p_amount,
    v_transfer_fee,
    v_fee_responsibility,
    v_total_amount,
    0,
    v_total_amount,
    'active',
    COALESCE(p_loan_date, now()),
    p_due_date,
    COALESCE(p_notes, '')
  )
  RETURNING * INTO v_loan;

  IF p_loan_type = 'money_lent' THEN
    UPDATE public.financial_accounts
    SET balance = balance - CASE WHEN v_fee_responsibility = 'borrower' THEN v_total_amount ELSE p_amount END
    WHERE id = p_account_id
      AND user_id = v_uid;

    IF v_transfer_fee > 0 AND v_fee_responsibility = 'lender' THEN
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
        'Loan Transfer Fee - ' || v_account.name || ' → ' || btrim(p_person_name),
        p_account_id,
        COALESCE(p_loan_date, now())
      )
      RETURNING id INTO v_fee_expense_id;

      UPDATE public.loans
      SET fee_expense_id = v_fee_expense_id
      WHERE id = v_loan.id
      RETURNING * INTO v_loan;
    END IF;
  ELSE
    UPDATE public.financial_accounts
    SET balance = balance + p_amount
    WHERE id = p_account_id
      AND user_id = v_uid;
  END IF;

  RETURN v_loan;
END;
$$;

DROP FUNCTION IF EXISTS public.record_loan_payment(uuid, numeric, uuid, timestamptz, text);
CREATE OR REPLACE FUNCTION public.record_loan_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_account_id uuid,
  p_paid_at timestamptz DEFAULT now(),
  p_note text DEFAULT ''
)
RETURNS public.loan_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_loan loans;
  v_payment loan_payments;
  v_new_paid numeric(14, 2);
  v_new_remaining numeric(14, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero.'; END IF;
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'Account is required.'; END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found.'; END IF;
  IF v_loan.status = 'paid' OR v_loan.remaining_amount <= 0.005 THEN RAISE EXCEPTION 'Loan is already paid.'; END IF;
  IF p_amount > v_loan.remaining_amount + 0.005 THEN RAISE EXCEPTION 'Payment amount cannot exceed the remaining balance.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.financial_accounts
    WHERE id = p_account_id
      AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Account not found.';
  END IF;

  INSERT INTO public.loan_payments (
    loan_id,
    user_id,
    account_id,
    amount,
    paid_at,
    note
  )
  VALUES (
    p_loan_id,
    v_uid,
    p_account_id,
    p_amount,
    COALESCE(p_paid_at, now()),
    COALESCE(p_note, '')
  )
  RETURNING * INTO v_payment;

  IF v_loan.loan_type = 'money_lent' THEN
    UPDATE public.financial_accounts
    SET balance = balance + p_amount
    WHERE id = p_account_id
      AND user_id = v_uid;
  ELSE
    UPDATE public.financial_accounts
    SET balance = balance - p_amount
    WHERE id = p_account_id
      AND user_id = v_uid;
  END IF;

  v_new_paid := v_loan.paid_amount + p_amount;
  v_new_remaining := GREATEST(0, v_loan.remaining_amount - p_amount);

  UPDATE public.loans
  SET paid_amount = v_new_paid,
      remaining_amount = v_new_remaining,
      status = CASE
        WHEN v_new_remaining <= 0.005 THEN 'paid'
        WHEN v_new_paid > 0.005 THEN 'partially_paid'
        ELSE 'active'
      END
  WHERE id = p_loan_id;

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_loan(text, text, numeric, uuid, timestamptz, date, text, uuid, uuid, text, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_loan_payment(uuid, numeric, uuid, timestamptz, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
