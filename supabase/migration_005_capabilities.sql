-- ============================================================
-- Migration 005: Replace role with independent capability flags
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Add capability columns ─────────────────────────────────
ALTER TABLE shared_group_members
  ADD COLUMN IF NOT EXISTS can_edit_budget    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_invite_members boolean NOT NULL DEFAULT false;

-- Migrate existing 'editor' role → both capabilities true
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_group_members' AND column_name = 'role'
  ) THEN
    UPDATE shared_group_members
      SET can_edit_budget = true, can_invite_members = true
      WHERE role = 'editor';

    ALTER TABLE shared_group_members DROP COLUMN role;
  END IF;
END $$;

-- ── 2. RPC: invite member (owner sets capabilities; editors invite as plain member) ──
CREATE OR REPLACE FUNCTION public.invite_group_member(
  p_group_id          uuid,
  p_email             text,
  p_can_edit_budget   boolean DEFAULT false,
  p_can_invite_members boolean DEFAULT false
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
  v_can_edit   boolean := false;
  v_can_invite boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = p_group_id;

  -- Only owner or a member with can_invite_members can invite
  IF v_owner != v_uid AND NOT EXISTS (
    SELECT 1 FROM shared_group_members
    WHERE group_id = p_group_id AND user_id = v_uid AND can_invite_members = true
  ) THEN
    RAISE EXCEPTION 'You do not have permission to invite members';
  END IF;

  -- Only the owner can grant capabilities on invite; non-owners always invite as plain member
  IF v_owner = v_uid THEN
    v_can_edit   := p_can_edit_budget;
    v_can_invite := p_can_invite_members;
  END IF;

  SELECT id INTO v_target FROM profiles WHERE email = lower(trim(p_email));
  IF NOT FOUND THEN RAISE EXCEPTION 'No account found with that email address.'; END IF;
  IF v_owner = v_target THEN RAISE EXCEPTION 'That user is already the group owner.'; END IF;

  INSERT INTO shared_group_members (group_id, user_id, email, can_edit_budget, can_invite_members)
  VALUES (p_group_id, v_target, lower(trim(p_email)), v_can_edit, v_can_invite)
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'That user is already a member.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_group_member(uuid, text, boolean, boolean) TO authenticated;

-- Drop old role-based overload if it exists
DROP FUNCTION IF EXISTS public.invite_group_member(uuid, text, text);

-- ── 3. RPC: update member capabilities (owner only) ──────────
CREATE OR REPLACE FUNCTION public.update_member_permissions(
  p_member_id          uuid,
  p_can_edit_budget    boolean,
  p_can_invite_members boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member shared_group_members;
  v_owner  uuid;
BEGIN
  SELECT * INTO v_member FROM shared_group_members WHERE id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = v_member.group_id;
  IF v_owner != auth.uid() THEN RAISE EXCEPTION 'Only the group owner can change permissions'; END IF;

  UPDATE shared_group_members
    SET can_edit_budget = p_can_edit_budget, can_invite_members = p_can_invite_members
    WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_permissions(uuid, boolean, boolean) TO authenticated;

-- Drop old role-update function
DROP FUNCTION IF EXISTS public.update_member_role(uuid, text);

-- ── 4. RPC: approve request — sets only the requested capability ──
CREATE OR REPLACE FUNCTION public.approve_permission_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req   permission_requests;
  v_owner uuid;
BEGIN
  SELECT * INTO v_req FROM permission_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already processed'; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = v_req.group_id;
  IF v_owner != auth.uid() THEN RAISE EXCEPTION 'Only the group owner can approve requests'; END IF;

  UPDATE permission_requests SET status = 'approved' WHERE id = p_request_id;

  -- Grant only the specific capability that was requested
  IF v_req.type = 'edit_access' THEN
    UPDATE shared_group_members SET can_edit_budget = true
      WHERE group_id = v_req.group_id AND user_id = v_req.user_id;
  ELSIF v_req.type = 'invite_permission' THEN
    UPDATE shared_group_members SET can_invite_members = true
      WHERE group_id = v_req.group_id AND user_id = v_req.user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_permission_request(uuid) TO authenticated;
