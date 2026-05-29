-- ============================================================
-- Migration 017: Payment source privacy & payer confirmation
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Add payment_source_status to shared_expenses ──────────
ALTER TABLE shared_expenses
  ADD COLUMN IF NOT EXISTS payment_source_status text NOT NULL DEFAULT 'confirmed'
    CHECK (payment_source_status IN ('pending', 'confirmed'));

-- ── 2. Extend notification type constraint ────────────────────
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'chat_message', 'group_invite', 'permission_approved', 'member_joined',
    'settlement_received', 'settlement_confirmed', 'settlement_rejected',
    'payment_source_pending'
  ));

-- ── 3. Trigger: notify payer when payment source is pending ───
CREATE OR REPLACE FUNCTION public.notify_on_payment_source_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire on INSERT when pending, or on UPDATE when it just became pending
  -- (payer changed or status flipped back to pending).
  IF NEW.payment_source_status = 'pending' AND NEW.paid_by_user_id IS NOT NULL THEN
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND (
             OLD.payment_source_status = 'confirmed'
          OR OLD.paid_by_user_id IS DISTINCT FROM NEW.paid_by_user_id
       ))
    THEN
      INSERT INTO notifications (user_id, type, title, message, related_id)
      VALUES (
        NEW.paid_by_user_id,
        'payment_source_pending',
        split_part(NEW.user_email, '@', 1) || ' added an expense you paid',
        'Select your payment source for ₱' ||
          trim(to_char(NEW.amount, 'FM999,999,999.00')),
        NEW.group_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_source_pending ON shared_expenses;
CREATE TRIGGER trg_payment_source_pending
  AFTER INSERT OR UPDATE ON shared_expenses
  FOR EACH ROW EXECUTE FUNCTION notify_on_payment_source_pending();

-- ── 4. confirm_payment_source RPC ────────────────────────────
-- Called by the payer. Sets account_id (triggering the balance
-- update via shared_expense_account_balance_trigger) and marks
-- the expense as confirmed.
CREATE OR REPLACE FUNCTION public.confirm_payment_source(
  p_expense_id uuid,
  p_account_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e shared_expenses;
BEGIN
  SELECT * INTO v_e FROM shared_expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;

  IF v_e.paid_by_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the payer can confirm the payment source';
  END IF;

  IF v_e.payment_source_status != 'pending' THEN
    RAISE EXCEPTION 'Payment source already confirmed';
  END IF;

  -- The shared_expense_account_balance_trigger (migration_016) handles
  -- the balance deduction automatically when account_id is set here.
  UPDATE shared_expenses
     SET account_id            = p_account_id,
         payment_source_status = 'confirmed'
   WHERE id = p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_payment_source(uuid, uuid) TO authenticated;

-- ── 5. Replace update_shared_expense RPC (add payment_source_status) ──
DROP FUNCTION IF EXISTS public.update_shared_expense(uuid, text, numeric, text, uuid, text, text, uuid);

CREATE OR REPLACE FUNCTION public.update_shared_expense(
  p_expense_id           uuid,
  p_category             text,
  p_amount               numeric,
  p_note                 text,
  p_paid_by_user_id      uuid   DEFAULT NULL,
  p_paid_by_email        text   DEFAULT '',
  p_split_mode           text   DEFAULT 'equal',
  p_account_id           uuid   DEFAULT NULL,
  p_payment_source_status text  DEFAULT 'confirmed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense shared_expenses;
  v_owner   uuid;
BEGIN
  SELECT * INTO v_expense FROM shared_expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = v_expense.group_id;

  IF v_expense.user_id != auth.uid()
    AND v_owner != auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM shared_group_members
       WHERE group_id = v_expense.group_id
         AND user_id  = auth.uid()
         AND can_edit_budget = true
    )
  THEN
    RAISE EXCEPTION 'You do not have permission to edit this expense';
  END IF;

  UPDATE shared_expenses
     SET category             = p_category,
         amount               = p_amount,
         note                 = p_note,
         paid_by_user_id      = COALESCE(p_paid_by_user_id, user_id),
         paid_by_email        = CASE WHEN p_paid_by_email = '' THEN user_email ELSE p_paid_by_email END,
         split_mode           = p_split_mode,
         account_id           = p_account_id,
         payment_source_status = p_payment_source_status
   WHERE id = p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_shared_expense(uuid, text, numeric, text, uuid, text, text, uuid, text) TO authenticated;
