-- ============================================================
-- Migration 050: Fix credit card overdue notifications
-- Run this in the Supabase SQL editor after migration 049.
-- ============================================================

-- Overdue must only mean current_date > computed due_date and outstanding > 0.
-- The generator should use the next due date from the active statement cycle,
-- not the previous cycle's due date.

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

      RAISE LOG 'Credit card due check: Current Date %, Due Date %, Outstanding %, Status %',
        v_today,
        NULL,
        v_outstanding,
        'Paid';

      CONTINUE;
    END IF;

    SELECT * INTO v_schedule
    FROM public.credit_card_schedule(v_today, v_card.soa_day, v_card.due_day);

    v_due_date := v_schedule.due_date;

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

-- Remove unread overdue notifications that were generated from a previous-cycle
-- due date while the current computed due date is still in the future.
WITH bad_logs AS (
  SELECT
    ccdnl.id,
    ccdnl.notification_id
  FROM public.credit_card_due_notification_log ccdnl
  JOIN public.financial_accounts fa
    ON fa.id = ccdnl.credit_card_account_id
  CROSS JOIN LATERAL public.credit_card_schedule(current_date, fa.soa_day, fa.due_day) schedule
  WHERE ccdnl.reminder_type = 'overdue'
    AND ccdnl.due_date < current_date
    AND schedule.due_date > current_date
    AND GREATEST(0, -fa.balance) > 0.005
),
deleted_notifications AS (
  DELETE FROM public.notifications n
  USING bad_logs bl
  WHERE n.id = bl.notification_id
    AND n.is_read = false
  RETURNING n.id
)
DELETE FROM public.credit_card_due_notification_log ccdnl
USING bad_logs bl
WHERE ccdnl.id = bl.id;

DO $$
DECLARE
  v_case record;
  v_today date := '2026-05-31'::date;
  v_due_date date;
  v_days_until integer;
  v_status text;
BEGIN
  SELECT * INTO v_case
  FROM public.credit_card_schedule(v_today, 5, 21);

  v_due_date := v_case.due_date;
  v_days_until := v_due_date - v_today;
  v_status := CASE
    WHEN v_days_until < 0 THEN 'Overdue'
    WHEN v_days_until = 0 THEN 'Due Today'
    WHEN v_days_until <= 5 THEN 'Upcoming'
    ELSE 'Current'
  END;

  IF v_due_date != '2026-06-21'::date OR v_status = 'Overdue' THEN
    RAISE EXCEPTION 'Credit card overdue test failed. Current Date %, Due Date %, Status %',
      v_today,
      v_due_date,
      v_status;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_credit_card_due_notifications() TO authenticated;

NOTIFY pgrst, 'reload schema';
