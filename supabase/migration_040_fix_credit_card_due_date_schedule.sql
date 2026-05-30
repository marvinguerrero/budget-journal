-- ============================================================
-- Migration 040: Fix credit card due date schedule
-- Run this in the Supabase SQL editor after migration 039.
-- ============================================================

-- Due day belongs to the statement month when it is after the SOA day.
-- If the due day is before or equal to the SOA day, it belongs to the next month.

CREATE OR REPLACE FUNCTION public.credit_card_schedule(
  p_expense_date date,
  p_soa_day integer,
  p_due_day integer
)
RETURNS TABLE (
  billing_cycle_start date,
  billing_cycle_end date,
  statement_date date,
  due_date date
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_month_start date := date_trunc('month', p_expense_date)::date;
  v_candidate_statement date;
  v_statement_month date;
  v_previous_statement date;
  v_due_month date;
BEGIN
  IF p_expense_date IS NULL OR p_soa_day IS NULL OR p_due_day IS NULL THEN
    RETURN;
  END IF;

  v_candidate_statement := public.clamped_month_date(
    EXTRACT(year FROM v_month_start)::integer,
    EXTRACT(month FROM v_month_start)::integer,
    p_soa_day
  );

  IF p_expense_date <= v_candidate_statement THEN
    statement_date := v_candidate_statement;
  ELSE
    v_statement_month := (v_month_start + interval '1 month')::date;
    statement_date := public.clamped_month_date(
      EXTRACT(year FROM v_statement_month)::integer,
      EXTRACT(month FROM v_statement_month)::integer,
      p_soa_day
    );
  END IF;

  v_previous_statement := public.clamped_month_date(
    EXTRACT(year FROM (date_trunc('month', statement_date) - interval '1 month'))::integer,
    EXTRACT(month FROM (date_trunc('month', statement_date) - interval '1 month'))::integer,
    p_soa_day
  );

  billing_cycle_start := v_previous_statement + 1;
  billing_cycle_end := statement_date;

  IF p_due_day > p_soa_day THEN
    v_due_month := date_trunc('month', statement_date)::date;
  ELSE
    v_due_month := (date_trunc('month', statement_date) + interval '1 month')::date;
  END IF;

  due_date := public.clamped_month_date(
    EXTRACT(year FROM v_due_month)::integer,
    EXTRACT(month FROM v_due_month)::integer,
    p_due_day
  );

  RETURN NEXT;
END;
$$;

DO $$
DECLARE
  v_case record;
BEGIN
  SELECT * INTO v_case
  FROM public.credit_card_schedule('2026-06-04'::date, 5, 21);

  IF v_case.billing_cycle_start != '2026-05-06'::date
     OR v_case.billing_cycle_end != '2026-06-05'::date
     OR v_case.statement_date != '2026-06-05'::date
     OR v_case.due_date != '2026-06-21'::date THEN
    RAISE EXCEPTION 'Credit card schedule test failed for SOA 5 / Due 21. Got cycle % - %, statement %, due %',
      v_case.billing_cycle_start,
      v_case.billing_cycle_end,
      v_case.statement_date,
      v_case.due_date;
  END IF;

  SELECT * INTO v_case
  FROM public.credit_card_schedule('2026-06-10'::date, 14, 3);

  IF v_case.billing_cycle_start != '2026-05-15'::date
     OR v_case.billing_cycle_end != '2026-06-14'::date
     OR v_case.statement_date != '2026-06-14'::date
     OR v_case.due_date != '2026-07-03'::date THEN
    RAISE EXCEPTION 'Credit card schedule test failed for SOA 14 / Due 3 before cutoff. Got cycle % - %, statement %, due %',
      v_case.billing_cycle_start,
      v_case.billing_cycle_end,
      v_case.statement_date,
      v_case.due_date;
  END IF;

  SELECT * INTO v_case
  FROM public.credit_card_schedule('2026-06-15'::date, 14, 3);

  IF v_case.billing_cycle_start != '2026-06-15'::date
     OR v_case.billing_cycle_end != '2026-07-14'::date
     OR v_case.statement_date != '2026-07-14'::date
     OR v_case.due_date != '2026-08-03'::date THEN
    RAISE EXCEPTION 'Credit card schedule test failed for SOA 14 / Due 3 after cutoff. Got cycle % - %, statement %, due %',
      v_case.billing_cycle_start,
      v_case.billing_cycle_end,
      v_case.statement_date,
      v_case.due_date;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_card_schedule(date, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
