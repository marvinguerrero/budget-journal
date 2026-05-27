-- ============================================================
-- Fix: Allow users to delete their own chat messages
-- Run this in the Supabase SQL editor.
-- ============================================================

DROP POLICY IF EXISTS "msg_delete" ON shared_group_messages;

CREATE POLICY "msg_delete" ON shared_group_messages
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
