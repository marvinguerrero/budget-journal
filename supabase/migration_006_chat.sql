-- ============================================================
-- Migration 006: Realtime group chat
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_group_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid        NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  user_email text        NOT NULL,
  message    text        NOT NULL CHECK (length(trim(message)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sgmsg_group_created
  ON shared_group_messages(group_id, created_at);

GRANT SELECT, INSERT ON shared_group_messages TO authenticated;

-- ── 2. RLS ───────────────────────────────────────────────────
ALTER TABLE shared_group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msg_select" ON shared_group_messages;
DROP POLICY IF EXISTS "msg_insert" ON shared_group_messages;

-- Only group members / owner can read messages
CREATE POLICY "msg_select" ON shared_group_messages
  FOR SELECT TO authenticated
  USING (is_group_member_or_owner(group_id));

-- Members can insert their own messages
CREATE POLICY "msg_insert" ON shared_group_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND is_group_member_or_owner(group_id)
  );

-- ── 3. RPC: send_group_message ────────────────────────────────
-- Fetches sender email from profiles automatically
CREATE OR REPLACE FUNCTION public.send_group_message(
  p_group_id uuid,
  p_message  text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_result shared_group_messages;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT is_group_member_or_owner(p_group_id) THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;

  IF trim(p_message) = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  INSERT INTO shared_group_messages (group_id, user_id, user_email, message)
  VALUES (p_group_id, v_uid, COALESCE(v_email, ''), trim(p_message))
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_group_message(uuid, text) TO authenticated;

-- ── 4. Enable Realtime ───────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE shared_group_messages;
