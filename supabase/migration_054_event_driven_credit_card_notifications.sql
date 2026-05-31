-- ============================================================
-- Migration 054: Event-driven credit card notifications
-- Run this in the Supabase SQL editor after migration 053.
-- ============================================================

-- Notification model:
-- - Setup notifications are created by account create/update transitions.
-- - Due notifications are created only by an explicit scheduled/manual RPC.
-- - App load, page refresh, and opening the notification bell should not create notifications.

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
    'credit_card_due',
    'credit_card_config'
  ));

CREATE OR REPLACE FUNCTION public.credit_card_missing_setup_fields(
  p_credit_limit numeric,
  p_soa_day integer,
  p_due_day integer
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF COALESCE(p_credit_limit, 0) <= 0 THEN
    v_missing := array_append(v_missing, 'Credit Limit');
  END IF;
  IF p_soa_day IS NULL THEN
    v_missing := array_append(v_missing, 'SOA Day');
  END IF;
  IF p_due_day IS NULL THEN
    v_missing := array_append(v_missing, 'Due Day');
  END IF;

  RETURN v_missing;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_credit_card_configured(
  p_credit_limit numeric,
  p_soa_day integer,
  p_due_day integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_credit_limit, 0) > 0
     AND p_soa_day IS NOT NULL
     AND p_due_day IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.resolve_credit_card_notifications(
  p_credit_card_account_id uuid,
  p_notification_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card financial_accounts;
BEGIN
  SELECT * INTO v_card
  FROM financial_accounts
  WHERE id = p_credit_card_account_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM notifications
  WHERE user_id = v_card.user_id
    AND related_id = p_credit_card_account_id
    AND is_read = false
    AND (
      p_notification_type IS NULL
      OR type = p_notification_type
    )
    AND type IN ('credit_card_due', 'credit_card_config');

  IF p_notification_type IS NULL OR p_notification_type = 'credit_card_due' THEN
    DELETE FROM credit_card_due_notification_log
    WHERE user_id = v_card.user_id
      AND credit_card_account_id = p_credit_card_account_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_credit_card_setup_notification(
  p_credit_card_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card financial_accounts;
  v_missing text[];
BEGIN
  SELECT * INTO v_card
  FROM financial_accounts
  WHERE id = p_credit_card_account_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_card.category != 'liability'
     OR NOT public.is_credit_card_account_type(v_card.type) THEN
    RETURN;
  END IF;

  v_missing := public.credit_card_missing_setup_fields(
    v_card.credit_limit,
    v_card.soa_day,
    v_card.due_day
  );

  IF COALESCE(array_length(v_missing, 1), 0) = 0 THEN
    PERFORM public.resolve_credit_card_notifications(p_credit_card_account_id, 'credit_card_config');
    RETURN;
  END IF;

  PERFORM public.resolve_credit_card_notifications(p_credit_card_account_id, 'credit_card_due');

  IF EXISTS (
    SELECT 1
    FROM notifications
    WHERE user_id = v_card.user_id
      AND type = 'credit_card_config'
      AND related_id = p_credit_card_account_id
      AND is_read = false
  ) THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    v_card.user_id,
    'credit_card_config',
    '⚠ Credit Card Setup Incomplete',
    v_card.name || ' is missing: ' || array_to_string(v_missing, ', ') ||
      '. Update the card configuration to enable billing cycle tracking and payment reminders.',
    v_card.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_credit_card_setup_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_configured boolean := false;
  v_new_configured boolean := false;
BEGIN
  IF NEW.category != 'liability'
     OR NOT public.is_credit_card_account_type(NEW.type) THEN
    RETURN NEW;
  END IF;

  v_new_configured := public.is_credit_card_configured(
    NEW.credit_limit,
    NEW.soa_day,
    NEW.due_day
  );

  IF TG_OP = 'INSERT' THEN
    IF NOT v_new_configured THEN
      PERFORM public.create_credit_card_setup_notification(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  v_old_configured := public.is_credit_card_configured(
    OLD.credit_limit,
    OLD.soa_day,
    OLD.due_day
  );

  IF v_new_configured THEN
    PERFORM public.resolve_credit_card_notifications(NEW.id, 'credit_card_config');
  ELSIF v_old_configured AND NOT v_new_configured THEN
    PERFORM public.create_credit_card_setup_notification(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_card_setup_notification ON public.financial_accounts;
CREATE TRIGGER trg_credit_card_setup_notification
  AFTER INSERT OR UPDATE OF credit_limit, soa_day, due_day, type, category
  ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_credit_card_setup_notification();

CREATE OR REPLACE FUNCTION public.validate_credit_card_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outstanding numeric(14, 2);
  v_schedule record;
  v_preserve_existing_cycle boolean := false;
  v_is_configured boolean;
BEGIN
  IF NEW.category = 'asset' AND NEW.balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance in selected account.';
  END IF;

  IF public.is_credit_card_account_type(NEW.type) THEN
    IF NEW.category != 'liability' THEN
      RAISE EXCEPTION 'Credit Card accounts must use the Liability category.';
    END IF;
    IF NEW.credit_limit IS NOT NULL AND NEW.credit_limit < 0 THEN
      RAISE EXCEPTION 'Credit limit cannot be negative.';
    END IF;
    IF NEW.soa_day IS NOT NULL AND NEW.soa_day NOT BETWEEN 1 AND 31 THEN
      RAISE EXCEPTION 'SOA day must be between 1 and 31.';
    END IF;
    IF NEW.due_day IS NOT NULL AND NEW.due_day NOT BETWEEN 1 AND 31 THEN
      RAISE EXCEPTION 'Due day must be between 1 and 31.';
    END IF;

    v_outstanding := GREATEST(0, -NEW.balance);
    v_is_configured := public.is_credit_card_configured(
      NEW.credit_limit,
      NEW.soa_day,
      NEW.due_day
    );

    IF v_is_configured AND v_outstanding > NEW.credit_limit THEN
      RAISE EXCEPTION 'Credit limit exceeded.';
    END IF;

    IF NOT v_is_configured THEN
      NEW.current_statement_date := NULL;
      NEW.current_due_date := NULL;
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF OLD.current_statement_date IS NOT NULL
         AND OLD.current_due_date IS NOT NULL
         AND OLD.soa_day IS NOT DISTINCT FROM NEW.soa_day
         AND OLD.due_day IS NOT DISTINCT FROM NEW.due_day
         AND OLD.last_statement_date IS NOT DISTINCT FROM NEW.last_statement_date
         AND v_outstanding > 0.005 THEN
        v_preserve_existing_cycle := true;
      END IF;
    END IF;

    IF v_preserve_existing_cycle THEN
      NEW.current_statement_date := OLD.current_statement_date;
      NEW.current_due_date := OLD.current_due_date;
    ELSE
      SELECT * INTO v_schedule
      FROM public.credit_card_schedule(current_date, NEW.soa_day, NEW.due_day);

      NEW.current_statement_date := v_schedule.statement_date;
      NEW.current_due_date := v_schedule.due_date;
    END IF;
  ELSE
    NEW.credit_limit := NULL;
    NEW.soa_day := NULL;
    NEW.due_day := NULL;
    NEW.last_statement_date := NULL;
    NEW.current_statement_date := NULL;
    NEW.current_due_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_credit_card_account ON public.financial_accounts;
CREATE TRIGGER trg_validate_credit_card_account
  BEFORE INSERT OR UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_credit_card_account();

CREATE OR REPLACE FUNCTION public.refresh_credit_card_cycle_dates(p_account_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_card financial_accounts;
  v_schedule record;
  v_count integer := 0;
  v_outstanding numeric(14, 2);
BEGIN
  FOR v_card IN
    SELECT *
    FROM financial_accounts
    WHERE (v_uid IS NULL OR user_id = v_uid)
      AND category = 'liability'
      AND public.is_credit_card_account_type(type)
      AND public.is_credit_card_configured(credit_limit, soa_day, due_day)
      AND (p_account_id IS NULL OR financial_accounts.id = p_account_id)
    FOR UPDATE
  LOOP
    v_outstanding := GREATEST(0, -v_card.balance);

    IF v_outstanding > 0.005
       AND v_card.current_due_date IS NOT NULL
       AND v_card.current_due_date < current_date THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_schedule
    FROM public.credit_card_schedule(current_date, v_card.soa_day, v_card.due_day);

    IF v_card.current_due_date IS NULL
       OR v_card.current_statement_date IS NULL
       OR v_outstanding <= 0.005 THEN
      UPDATE financial_accounts
        SET current_statement_date = v_schedule.statement_date,
            current_due_date = v_schedule.due_date
        WHERE financial_accounts.id = v_card.id;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

DROP FUNCTION IF EXISTS public.generate_credit_card_due_notifications();

CREATE OR REPLACE FUNCTION public.generate_credit_card_due_notifications(p_run_date date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card financial_accounts;
  v_due_date date;
  v_days_until integer;
  v_reminder_type text;
  v_title text;
  v_message text;
  v_notification_id uuid;
  v_count integer := 0;
  v_outstanding numeric(14, 2);
  v_status text;
BEGIN
  FOR v_card IN
    SELECT *
    FROM financial_accounts
    WHERE category = 'liability'
      AND public.is_credit_card_account_type(type)
      AND public.is_credit_card_configured(credit_limit, soa_day, due_day)
      AND current_due_date IS NOT NULL
  LOOP
    BEGIN
      v_outstanding := GREATEST(0, -v_card.balance);
      v_due_date := v_card.current_due_date;

      IF v_outstanding <= 0.005 THEN
        PERFORM public.resolve_credit_card_notifications(v_card.id, 'credit_card_due');
        CONTINUE;
      END IF;

      v_days_until := v_due_date - p_run_date;
      v_reminder_type := NULL;
      v_title := NULL;

      IF v_days_until = 5 THEN
        v_reminder_type := '5_days';
        v_title := '💳 Credit Card Due in 5 Days';
      ELSIF v_days_until = 3 THEN
        v_reminder_type := '3_days';
        v_title := '💳 Credit Card Due in 3 Days';
      ELSIF v_days_until = 1 THEN
        v_reminder_type := '1_day';
        v_title := '💳 Credit Card Due Tomorrow';
      ELSIF v_days_until = 0 THEN
        v_reminder_type := 'due_today';
        v_title := '💳 Credit Card Payment Due Today';
      ELSIF v_days_until < 0 THEN
        v_reminder_type := 'overdue';
        v_title := '⚠ Credit Card Payment Overdue';
      END IF;

      v_status := CASE
        WHEN v_days_until < 0 THEN 'Overdue'
        WHEN v_days_until = 0 THEN 'Due Today'
        WHEN v_days_until <= 5 THEN 'Upcoming'
        ELSE 'Current'
      END;

      RAISE LOG 'Credit card due check: Current Date %, Due Date %, Outstanding %, Status %',
        p_run_date,
        v_due_date,
        v_outstanding,
        v_status;

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
      VALUES (v_card.user_id, 'credit_card_due', v_title, v_message, v_card.id)
      RETURNING id INTO v_notification_id;

      INSERT INTO credit_card_due_notification_log (
        user_id,
        credit_card_account_id,
        due_date,
        reminder_type,
        notification_id
      )
      VALUES (
        v_card.user_id,
        v_card.id,
        v_due_date,
        v_reminder_type,
        v_notification_id
      );

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'Credit card notification skipped for account %. Error: %',
        v_card.id,
        SQLERRM;
      CONTINUE;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_credit_card_due_notifications(p_credit_card_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.resolve_credit_card_notifications(p_credit_card_account_id, 'credit_card_due');
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
    PERFORM public.resolve_credit_card_notifications(p_credit_card_account_id, 'credit_card_due');
    PERFORM public.refresh_credit_card_cycle_dates(p_credit_card_account_id);
  END IF;

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_card_missing_setup_fields(numeric, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_credit_card_configured(numeric, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_credit_card_notifications(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_credit_card_setup_notification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_credit_card_cycle_dates(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_credit_card_due_notifications(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_credit_card_due_notifications(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_credit_card_payment(uuid, uuid, numeric, timestamptz) TO authenticated;

INSERT INTO notifications (user_id, type, title, message, related_id)
SELECT
  fa.user_id,
  'credit_card_config',
  '⚠ Credit Card Setup Incomplete',
  fa.name || ' is missing: ' ||
    array_to_string(public.credit_card_missing_setup_fields(fa.credit_limit, fa.soa_day, fa.due_day), ', ') ||
    '. Update the card configuration to enable billing cycle tracking and payment reminders.',
  fa.id
FROM financial_accounts fa
WHERE fa.category = 'liability'
  AND public.is_credit_card_account_type(fa.type)
  AND NOT public.is_credit_card_configured(fa.credit_limit, fa.soa_day, fa.due_day)
  AND NOT EXISTS (
    SELECT 1
    FROM notifications n
    WHERE n.user_id = fa.user_id
      AND n.type = 'credit_card_config'
      AND n.related_id = fa.id
      AND n.is_read = false
  );

NOTIFY pgrst, 'reload schema';
