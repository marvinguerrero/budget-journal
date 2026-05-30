-- ============================================================
-- Migration 049: Credit card due date notifications
-- Run this in the Supabase SQL editor after migration 048.
-- ============================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'chat_message',
    'group_invite',
    'permission_approved',
    'member_joined',
    'settlement_received',
    'settlement_confirmed',
    'settlement_rejected',
    'payment_source_pending',
    'contact_request',
    'personal_debt_created',
    'credit_card_due'
  ));

CREATE TABLE IF NOT EXISTS public.credit_card_due_notification_log (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_card_account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  due_date               date NOT NULL,
  reminder_type          text NOT NULL CHECK (reminder_type IN ('5_days', '3_days', '1_day', 'due_today', 'overdue')),
  notification_id        uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credit_card_account_id, due_date, reminder_type)
);

CREATE INDEX IF NOT EXISTS credit_card_due_notification_log_user_idx
  ON public.credit_card_due_notification_log(user_id, created_at DESC);

GRANT SELECT ON public.credit_card_due_notification_log TO authenticated;

ALTER TABLE public.credit_card_due_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_card_due_notification_log_select_own" ON public.credit_card_due_notification_log;
CREATE POLICY "credit_card_due_notification_log_select_own" ON public.credit_card_due_notification_log
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.clear_credit_card_due_notifications(p_credit_card_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  DELETE FROM notifications
  WHERE user_id = v_uid
    AND type = 'credit_card_due'
    AND related_id = p_credit_card_account_id
    AND is_read = false;

  DELETE FROM credit_card_due_notification_log
  WHERE user_id = v_uid
    AND credit_card_account_id = p_credit_card_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_credit_card_due_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_card financial_accounts;
  v_today date := current_date;
  v_next record;
  v_previous record;
  v_due_date date;
  v_days_until integer;
  v_reminder_type text;
  v_title text;
  v_message text;
  v_notification_id uuid;
  v_count integer := 0;
  v_outstanding numeric(14, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR v_card IN
    SELECT *
    FROM financial_accounts
    WHERE user_id = v_uid
      AND category = 'liability'
      AND public.is_credit_card_account_type(type)
  LOOP
    v_outstanding := GREATEST(0, -v_card.balance);

    IF v_outstanding <= 0.005 THEN
      PERFORM public.clear_credit_card_due_notifications(v_card.id);
      CONTINUE;
    END IF;

    SELECT * INTO v_next
    FROM public.credit_card_schedule(v_today, v_card.soa_day, v_card.due_day);

    SELECT * INTO v_previous
    FROM public.credit_card_schedule((v_today - interval '1 month')::date, v_card.soa_day, v_card.due_day);

    v_due_date := v_next.due_date;

    IF v_previous.due_date IS NOT NULL
       AND v_today > v_previous.due_date
       AND v_today < v_next.due_date THEN
      v_due_date := v_previous.due_date;
    END IF;

    v_days_until := v_due_date - v_today;
    v_reminder_type := NULL;
    v_title := NULL;

    IF v_days_until = 5 THEN
      v_reminder_type := '5_days';
      v_title := 'Credit Card Payment Due Soon';
    ELSIF v_days_until = 3 THEN
      v_reminder_type := '3_days';
      v_title := 'Credit Card Due in 3 Days';
    ELSIF v_days_until = 1 THEN
      v_reminder_type := '1_day';
      v_title := 'Credit Card Due Tomorrow';
    ELSIF v_days_until = 0 THEN
      v_reminder_type := 'due_today';
      v_title := 'Credit Card Payment Due Today';
    ELSIF v_days_until < 0 THEN
      v_reminder_type := 'overdue';
      v_title := 'Credit Card Payment Overdue';
    END IF;

    IF v_reminder_type IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM credit_card_due_notification_log
      WHERE credit_card_account_id = v_card.id
        AND due_date = v_due_date
        AND reminder_type = v_reminder_type
    ) THEN
      CONTINUE;
    END IF;

    IF v_reminder_type = 'overdue' THEN
      v_message := v_card.name || ' is overdue. Outstanding: ₱' ||
        trim(to_char(v_outstanding, 'FM999G999G999G990D00')) ||
        '. Due Date: ' || to_char(v_due_date, 'Mon DD, YYYY') || '.';
    ELSE
      v_message := v_card.name || ' payment is due ' ||
        CASE
          WHEN v_days_until = 0 THEN 'today'
          WHEN v_days_until = 1 THEN 'tomorrow'
          ELSE 'in ' || v_days_until || ' days'
        END ||
        '. Amount Due: ₱' || trim(to_char(v_outstanding, 'FM999G999G999G990D00')) ||
        '. Due Date: ' || to_char(v_due_date, 'Mon DD, YYYY') || '.';
    END IF;

    INSERT INTO notifications (user_id, type, title, message, related_id)
    VALUES (v_uid, 'credit_card_due', v_title, v_message, v_card.id)
    RETURNING id INTO v_notification_id;

    INSERT INTO credit_card_due_notification_log (
      user_id,
      credit_card_account_id,
      due_date,
      reminder_type,
      notification_id
    )
    VALUES (
      v_uid,
      v_card.id,
      v_due_date,
      v_reminder_type,
      v_notification_id
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

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

  IF v_remaining <= 0.005 THEN
    PERFORM public.clear_credit_card_due_notifications(p_credit_card_account_id);
  END IF;

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_credit_card_due_notifications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_credit_card_due_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_credit_card_payment(uuid, uuid, numeric, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
