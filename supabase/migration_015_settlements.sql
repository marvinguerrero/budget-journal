-- ============================================================
-- Migration 015: Expense settlement confirmation flow
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Extend notification type constraint ────────────────────
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'chat_message', 'group_invite', 'permission_approved', 'member_joined',
    'settlement_received', 'settlement_confirmed', 'settlement_rejected'
  ));

-- ── 2. Add "Settlement" default income source ─────────────────
-- Used when a confirmed settlement credits the receiver's account.
INSERT INTO income_sources (user_id, name, emoji, color, is_default)
VALUES (NULL, 'Settlement', '💸', '#6366F1', true)
ON CONFLICT (lower(name)) WHERE user_id IS NULL DO NOTHING;

-- ── 3. shared_expense_settlements table ───────────────────────
CREATE TABLE IF NOT EXISTS shared_expense_settlements (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid          NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  payer_user_id       uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payer_email         text          NOT NULL,
  receiver_user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_email      text          NOT NULL,
  amount              numeric(12,2) NOT NULL CHECK (amount > 0),
  payer_account_id    uuid          REFERENCES financial_accounts(id) ON DELETE SET NULL,
  receiver_account_id uuid          REFERENCES financial_accounts(id) ON DELETE SET NULL,
  expense_id          uuid          REFERENCES expenses(id) ON DELETE SET NULL,
  income_entry_id     uuid          REFERENCES income_entries(id) ON DELETE SET NULL,
  status              text          NOT NULL DEFAULT 'pending_confirmation'
                                    CHECK (status IN ('pending_confirmation', 'confirmed', 'rejected')),
  note                text          NOT NULL DEFAULT '',
  created_at          timestamptz   NOT NULL DEFAULT now(),
  confirmed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS ses_group_idx    ON shared_expense_settlements(group_id);
CREATE INDEX IF NOT EXISTS ses_payer_idx    ON shared_expense_settlements(payer_user_id);
CREATE INDEX IF NOT EXISTS ses_receiver_idx ON shared_expense_settlements(receiver_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON shared_expense_settlements TO authenticated;

ALTER TABLE shared_expense_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sset_select" ON shared_expense_settlements;
DROP POLICY IF EXISTS "sset_insert" ON shared_expense_settlements;

-- Any group member can read settlements for the group
CREATE POLICY "sset_select" ON shared_expense_settlements
  FOR SELECT TO authenticated
  USING (is_group_member_or_owner(group_id));

-- Only the payer can create a settlement (for themselves)
CREATE POLICY "sset_insert" ON shared_expense_settlements
  FOR INSERT TO authenticated
  WITH CHECK (payer_user_id = auth.uid() AND is_group_member_or_owner(group_id));

-- ── 4. Notification trigger for settlement events ─────────────
CREATE OR REPLACE FUNCTION public.notify_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Notify the receiver that a payment is pending their confirmation
    INSERT INTO notifications (user_id, type, title, message, related_id)
    VALUES (
      NEW.receiver_user_id,
      'settlement_received',
      split_part(NEW.payer_email, '@', 1) || ' marked ₱' ||
        trim(to_char(NEW.amount, 'FM999,999,999.00')) || ' as paid',
      'Confirm payment received?',
      NEW.group_id
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'confirmed' AND OLD.status = 'pending_confirmation' THEN
      INSERT INTO notifications (user_id, type, title, message, related_id)
      VALUES (
        NEW.payer_user_id,
        'settlement_confirmed',
        split_part(NEW.receiver_email, '@', 1) || ' confirmed your payment',
        '₱' || trim(to_char(NEW.amount, 'FM999,999,999.00')) || ' settlement confirmed',
        NEW.group_id
      );

    ELSIF NEW.status = 'rejected' AND OLD.status = 'pending_confirmation' THEN
      INSERT INTO notifications (user_id, type, title, message, related_id)
      VALUES (
        NEW.payer_user_id,
        'settlement_rejected',
        split_part(NEW.receiver_email, '@', 1) || ' rejected your payment',
        '₱' || trim(to_char(NEW.amount, 'FM999,999,999.00')) || ' settlement was rejected',
        NEW.group_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_notify ON shared_expense_settlements;
CREATE TRIGGER trg_settlement_notify
  AFTER INSERT OR UPDATE ON shared_expense_settlements
  FOR EACH ROW EXECUTE FUNCTION notify_on_settlement();

-- ── 5. confirm_settlement RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_settlement(
  p_settlement_id     uuid,
  p_receiver_account_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s      shared_expense_settlements;
  v_src_id uuid;
  v_inc_id uuid;
BEGIN
  SELECT * INTO v_s FROM shared_expense_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_s.receiver_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the receiver can confirm this settlement';
  END IF;
  IF v_s.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Settlement has already been processed';
  END IF;

  -- Mark as confirmed
  UPDATE shared_expense_settlements
     SET status              = 'confirmed',
         confirmed_at        = now(),
         receiver_account_id = p_receiver_account_id
   WHERE id = p_settlement_id;

  -- Create income entry for receiver if they selected an account
  IF p_receiver_account_id IS NOT NULL THEN
    SELECT id INTO v_src_id
      FROM income_sources
     WHERE lower(name) = 'settlement' AND user_id IS NULL
     LIMIT 1;

    INSERT INTO income_entries
      (user_id, income_source_id, account_id, amount, note, status, received_at)
    VALUES (
      v_s.receiver_user_id,
      v_src_id,
      p_receiver_account_id,
      v_s.amount,
      'Settlement from ' || split_part(v_s.payer_email, '@', 1),
      'received',
      now()
    )
    RETURNING id INTO v_inc_id;

    UPDATE shared_expense_settlements
       SET income_entry_id = v_inc_id
     WHERE id = p_settlement_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_settlement(uuid, uuid) TO authenticated;

-- ── 6. reject_settlement RPC ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_settlement(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s shared_expense_settlements;
BEGIN
  SELECT * INTO v_s FROM shared_expense_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_s.receiver_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the receiver can reject this settlement';
  END IF;
  IF v_s.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Settlement has already been processed';
  END IF;

  -- Delete the payer's expense; the trigger restores their account balance
  IF v_s.expense_id IS NOT NULL THEN
    DELETE FROM expenses WHERE id = v_s.expense_id;
  END IF;

  -- Mark as rejected
  UPDATE shared_expense_settlements
     SET status = 'rejected'
   WHERE id = p_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_settlement(uuid) TO authenticated;
