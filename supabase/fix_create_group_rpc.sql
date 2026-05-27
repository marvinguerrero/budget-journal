-- ============================================================
-- Fix: use an RPC function to create shared groups
-- This bypasses the INSERT RLS WITH CHECK issue entirely.
-- Run this in the Supabase SQL editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_shared_group(p_name text, p_emoji text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result  shared_groups;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO shared_groups (name, emoji, owner_id)
  VALUES (p_name, p_emoji, v_user_id)
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_shared_group(text, text) TO authenticated;
