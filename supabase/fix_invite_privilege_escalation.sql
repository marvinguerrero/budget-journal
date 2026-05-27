-- ============================================================
-- Fix: prevent privilege escalation via invite_group_member
-- Editors can invite, but only as 'member'.
-- Only the owner can assign 'editor' role.
-- Run this in the Supabase SQL editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.invite_group_member(
  p_group_id uuid, p_email text, p_role text DEFAULT 'member'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_target uuid;
  v_result shared_group_members;
  v_role   text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = p_group_id;

  -- Only owner or editor can invite
  IF v_owner != v_uid AND NOT EXISTS (
    SELECT 1 FROM shared_group_members
    WHERE group_id = p_group_id AND user_id = v_uid AND role = 'editor'
  ) THEN
    RAISE EXCEPTION 'Only owners and editors can invite members';
  END IF;

  -- Non-owners can only invite as 'member' — prevents privilege escalation
  IF v_owner != v_uid THEN
    v_role := 'member';
  ELSIF p_role IN ('editor', 'member') THEN
    v_role := p_role;
  ELSE
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT id INTO v_target FROM profiles WHERE email = lower(trim(p_email));
  IF NOT FOUND THEN RAISE EXCEPTION 'No account found with that email address.'; END IF;
  IF v_owner = v_target THEN RAISE EXCEPTION 'That user is already the group owner.'; END IF;

  INSERT INTO shared_group_members (group_id, user_id, email, role)
  VALUES (p_group_id, v_target, lower(trim(p_email)), v_role)
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'That user is already a member.';
END;
$$;
