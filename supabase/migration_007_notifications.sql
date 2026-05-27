-- ============================================================
-- Migration 007: In-app realtime notifications
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text        NOT NULL,   -- chat_message | group_invite | permission_approved | member_joined
  title      text        NOT NULL,
  message    text        NOT NULL,
  is_read    boolean     NOT NULL DEFAULT false,
  related_id uuid,                   -- group_id for navigation
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_created
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON notifications(user_id) WHERE is_read = false;

-- Authenticated users can only read their own notifications
GRANT SELECT ON notifications TO authenticated;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select" ON notifications;

CREATE POLICY "notif_select" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- ── 2. RPCs: mark as read ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications SET is_read = true
  WHERE id = p_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications SET is_read = true
  WHERE user_id = auth.uid() AND is_read = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ── 3. Trigger: chat messages ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_name text;
  v_sender     text;
  v_preview    text;
BEGIN
  SELECT name INTO v_group_name FROM shared_groups WHERE id = NEW.group_id;
  v_sender  := split_part(NEW.user_email, '@', 1);
  v_preview := left(NEW.message, 80);

  -- Notify all group members except sender
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT m.user_id, 'chat_message',
    '💬 ' || v_group_name,
    v_sender || ': ' || v_preview,
    NEW.group_id
  FROM shared_group_members m
  WHERE m.group_id = NEW.group_id AND m.user_id != NEW.user_id;

  -- Notify group owner if not the sender
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT g.owner_id, 'chat_message',
    '💬 ' || v_group_name,
    v_sender || ': ' || v_preview,
    NEW.group_id
  FROM shared_groups g
  WHERE g.id = NEW.group_id AND g.owner_id != NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_chat_message ON shared_group_messages;
CREATE TRIGGER on_chat_message
  AFTER INSERT ON shared_group_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_chat_message();

-- ── 4. Trigger: member invited ────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_member_invited()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_name text;
BEGIN
  SELECT name INTO v_group_name FROM shared_groups WHERE id = NEW.group_id;

  -- Notify the invited user
  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    NEW.user_id, 'group_invite',
    '👥 Group invite',
    'You were added to "' || v_group_name || '"',
    NEW.group_id
  );

  -- Notify existing members (excluding the new member and the inviter)
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT m.user_id, 'member_joined',
    '👤 New member',
    split_part(NEW.email, '@', 1) || ' joined "' || v_group_name || '"',
    NEW.group_id
  FROM shared_group_members m
  WHERE m.group_id = NEW.group_id
    AND m.user_id != NEW.user_id
    AND m.user_id != auth.uid();

  -- Notify owner if they're not the inviter
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT g.owner_id, 'member_joined',
    '👤 New member',
    split_part(NEW.email, '@', 1) || ' joined "' || v_group_name || '"',
    NEW.group_id
  FROM shared_groups g
  WHERE g.id = NEW.group_id
    AND g.owner_id != NEW.user_id
    AND g.owner_id != auth.uid();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_member_invited ON shared_group_members;
CREATE TRIGGER on_member_invited
  AFTER INSERT ON shared_group_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_member_invited();

-- ── 5. Trigger: permission approved ──────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_permission_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_name text;
  v_msg        text;
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    SELECT name INTO v_group_name FROM shared_groups WHERE id = NEW.group_id;

    v_msg := CASE NEW.type
      WHEN 'edit_access'       THEN 'You can now edit budgets in "' || v_group_name || '"'
      WHEN 'invite_permission' THEN 'You can now invite members to "' || v_group_name || '"'
      ELSE 'Your request was approved in "' || v_group_name || '"'
    END;

    INSERT INTO notifications (user_id, type, title, message, related_id)
    VALUES (NEW.user_id, 'permission_approved', '✅ Permission granted', v_msg, NEW.group_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_permission_approved ON permission_requests;
CREATE TRIGGER on_permission_approved
  AFTER UPDATE ON permission_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_permission_approved();

-- ── 6. Enable realtime ────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
