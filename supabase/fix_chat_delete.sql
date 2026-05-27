-- ============================================================
-- Fix: Allow users to delete their own chat messages
-- Run this in the Supabase SQL editor.
-- ============================================================

DROP POLICY IF EXISTS "msg_delete" ON shared_group_messages;

CREATE POLICY "msg_delete" ON shared_group_messages
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- RPC to bypass RLS silent-failure on direct DELETE
CREATE OR REPLACE FUNCTION public.delete_group_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg shared_group_messages;
BEGIN
  SELECT * INTO v_msg FROM shared_group_messages WHERE id = p_message_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_msg.user_id != auth.uid() THEN
    RAISE EXCEPTION 'You can only delete your own messages';
  END IF;

  DELETE FROM shared_group_messages WHERE id = p_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_group_message(uuid) TO authenticated;
