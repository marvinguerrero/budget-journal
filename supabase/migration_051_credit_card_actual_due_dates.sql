-- ============================================================
-- Migration 051: Credit card actual due dates
-- Run this in the Supabase SQL editor after migration 050.
-- ============================================================

-- SOA Day and Due Day are recurring configuration values.
-- Current Statement Date and Current Due Date are concrete billing-cycle dates.

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS current_statement_date date,
  ADD COLUMN IF NOT EXISTS current_due_date date;

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
BEGIN
  IF NEW.category = 'asset' AND NEW.balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance in selected account.';
  END IF;

  IF public.is_credit_card_account_type(NEW.type) THEN
    IF NEW.category != 'liability' THEN
      RAISE EXCEPTION 'Credit Card accounts must use the Liability category.';
    END IF;
    IF NEW.credit_limit IS NULL OR NEW.credit_limit <= 0 THEN
      RAISE EXCEPTION 'Credit limit must be greater than 0.';
    END IF;
    IF NEW.soa_day IS NULL OR NEW.soa_day NOT BETWEEN 1 AND 31 THEN
      RAISE EXCEPTION 'SOA day must be between 1 and 31.';
    END IF;
    IF NEW.due_day IS NULL OR NEW.due_day NOT BETWEEN 1 AND 31 THEN
      RAISE EXCEPTION 'Due day must be between 1 and 31.';
    END IF;

    v_outstanding := GREATEST(0, -NEW.balance);
    IF v_outstanding > NEW.credit_limit THEN
      RAISE EXCEPTION 'Credit limit exceeded.';
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR v_card IN
    SELECT *
    FROM financial_accounts
    WHERE user_id = v_uid
      AND category = 'liability'
      AND public.is_credit_card_account_type(type)
      AND (p_account_id IS NULL OR id = p_account_id)
    FOR UPDATE
  LOOP
    v_outstanding := GREATEST(0, -v_card.balance);

    SELECT * INTO v_schedule
    FROM public.credit_card_schedule(current_date, v_card.soa_day, v_card.due_day);

    IF v_card.current_due_date IS NULL
       OR v_card.current_statement_date IS NULL
       OR v_outstanding <= 0.005
       OR v_card.current_due_date < current_date THEN
      IF v_outstanding > 0.005
         AND v_card.current_due_date IS NOT NULL
         AND v_card.current_due_date < current_date THEN
        CONTINUE;
      END IF;

      UPDATE financial_accounts
        SET current_statement_date = v_schedule.statement_date,
            current_due_date = v_schedule.due_date
        WHERE id = v_card.id;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

WITH schedules AS (
  SELECT
    fa.id,
    schedule.statement_date,
    schedule.due_date
  FROM public.financial_accounts fa
  CROSS JOIN LATERAL public.credit_card_schedule(current_date, fa.soa_day, fa.due_day) schedule
  WHERE fa.category = 'liability'
    AND public.is_credit_card_account_type(fa.type)
    AND (
      fa.current_statement_date IS NULL
      OR fa.current_due_date IS NULL
      OR GREATEST(0, -fa.balance) <= 0.005
    )
)
UPDATE public.financial_accounts fa
  SET current_statement_date = schedules.statement_date,
      current_due_date = schedules.due_date
FROM schedules
WHERE fa.id = schedules.id;

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

WITH bad_logs AS (
  SELECT
    ccdnl.id,
    ccdnl.notification_id
  FROM public.credit_card_due_notification_log ccdnl
  JOIN public.financial_accounts fa
    ON fa.id = ccdnl.credit_card_account_id
  WHERE ccdnl.reminder_type = 'overdue'
    AND fa.current_due_date IS NOT NULL
    AND current_date < fa.current_due_date
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
  v_today date := '2026-05-31'::date;
  v_due_date date := '2026-06-21'::date;
  v_days_until integer;
  v_status text;
BEGIN
  v_days_until := v_due_date - v_today;
  v_status := CASE
    WHEN v_days_until < 0 THEN 'Overdue'
    WHEN v_days_until = 0 THEN 'Due Today'
    WHEN v_days_until <= 5 THEN 'Upcoming'
    ELSE 'Current'
  END;

  IF v_status = 'Overdue' THEN
    RAISE EXCEPTION 'Credit card actual due date test failed. Current Date %, Current Due Date %, Status %',
      v_today,
      v_due_date,
      v_status;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_credit_card_cycle_dates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_credit_card_due_notifications() TO authenticated;

NOTIFY pgrst, 'reload schema';
