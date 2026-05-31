-- ============================================================
-- Migration 052: Harden credit card due notification RPC
-- Run this in the Supabase SQL editor after migration 051.
-- ============================================================

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS current_statement_date date,
  ADD COLUMN IF NOT EXISTS current_due_date date;

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
      AND (p_account_id IS NULL OR financial_accounts.id = p_account_id)
    FOR UPDATE
  LOOP
    v_outstanding := GREATEST(0, -v_card.balance);

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
  v_schedule record;
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
  IF v_uid IS NULL THEN
    RAISE LOG 'Credit card due check skipped: no authenticated user';
    RETURN 0;
  END IF;

  PERFORM public.refresh_credit_card_cycle_dates(NULL);

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

      RAISE LOG 'Credit card due check: Current Date %, Due Date %, Outstanding %, Status %',
        v_today,
        v_card.current_due_date,
        v_outstanding,
        'Paid';

      CONTINUE;
    END IF;

    IF v_card.current_due_date IS NULL THEN
      SELECT * INTO v_schedule
      FROM public.credit_card_schedule(v_today, v_card.soa_day, v_card.due_day);

      v_due_date := v_schedule.due_date;
    ELSE
      v_due_date := v_card.current_due_date;
    END IF;

    IF v_due_date IS NULL THEN
      RAISE LOG 'Credit card due check: Current Date %, Due Date %, Outstanding %, Status %',
        v_today,
        NULL,
        v_outstanding,
        'No due date';

      CONTINUE;
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

    v_status := CASE
      WHEN v_days_until < 0 THEN 'Overdue'
      WHEN v_days_until = 0 THEN 'Due Today'
      WHEN v_days_until <= 5 THEN 'Upcoming'
      ELSE 'Current'
    END;

    RAISE LOG 'Credit card due check: Current Date %, Due Date %, Outstanding %, Status %',
      v_today,
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

GRANT EXECUTE ON FUNCTION public.refresh_credit_card_cycle_dates(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_credit_card_due_notifications() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
