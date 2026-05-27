-- ============================================================
-- Migration 004: Member Roles + Permission Requests
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Add role column to shared_group_members ───────────────
ALTER TABLE shared_group_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('editor', 'member'));

-- Allow owner to update member roles
DROP POLICY IF EXISTS "sgm_update" ON shared_group_members;
CREATE POLICY "sgm_update" ON shared_group_members
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = (select auth.uid())
  ));

GRANT UPDATE ON shared_group_members TO authenticated;

-- ── 2. permission_requests table ─────────────────────────────
CREATE TABLE IF NOT EXISTS permission_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  type       text NOT NULL CHECK (type IN ('edit_access', 'invite_permission')),
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

-- One pending request per (group, user, type) at a time
CREATE UNIQUE INDEX IF NOT EXISTS pr_pending_unique
  ON permission_requests (group_id, user_id, type)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS pr_group_idx ON permission_requests(group_id);

GRANT SELECT, INSERT, UPDATE ON permission_requests TO authenticated;
ALTER TABLE permission_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pr_select" ON permission_requests;
DROP POLICY IF EXISTS "pr_insert" ON permission_requests;

CREATE POLICY "pr_select" ON permission_requests
  FOR SELECT TO authenticated USING (is_group_member_or_owner(group_id));

CREATE POLICY "pr_insert" ON permission_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND is_group_member_or_owner(group_id));

-- ── 3. RPC: invite member with role ──────────────────────────
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_role NOT IN ('editor', 'member') THEN RAISE EXCEPTION 'Invalid role'; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = p_group_id;

  -- Owner or editor can invite
  IF v_owner != v_uid AND NOT EXISTS (
    SELECT 1 FROM shared_group_members
    WHERE group_id = p_group_id AND user_id = v_uid AND role = 'editor'
  ) THEN
    RAISE EXCEPTION 'Only owners and editors can invite members';
  END IF;

  SELECT id INTO v_target FROM profiles WHERE email = lower(trim(p_email));
  IF NOT FOUND THEN RAISE EXCEPTION 'No account found with that email address.'; END IF;
  IF v_owner = v_target THEN RAISE EXCEPTION 'That user is already the group owner.'; END IF;

  INSERT INTO shared_group_members (group_id, user_id, email, role)
  VALUES (p_group_id, v_target, lower(trim(p_email)), p_role)
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'That user is already a member.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_group_member(uuid, text, text) TO authenticated;

-- ── 4. RPC: update member role (owner only) ──────────────────
CREATE OR REPLACE FUNCTION public.update_member_role(p_member_id uuid, p_role text)
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
  IF v_owner != auth.uid() THEN RAISE EXCEPTION 'Only the group owner can change roles'; END IF;
  IF p_role NOT IN ('editor', 'member') THEN RAISE EXCEPTION 'Invalid role'; END IF;

  UPDATE shared_group_members SET role = p_role WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_role(uuid, text) TO authenticated;

-- ── 5. RPC: create permission request (members only) ─────────
CREATE OR REPLACE FUNCTION public.create_permission_request(p_group_id uuid, p_type text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_result permission_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_type NOT IN ('edit_access', 'invite_permission') THEN RAISE EXCEPTION 'Invalid request type'; END IF;

  -- Must be an invited member (not owner)
  IF NOT EXISTS (SELECT 1 FROM shared_group_members WHERE group_id = p_group_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Must be a group member to request permissions';
  END IF;

  -- Prevent duplicate pending requests
  IF EXISTS (SELECT 1 FROM permission_requests WHERE group_id = p_group_id AND user_id = v_uid AND type = p_type AND status = 'pending') THEN
    RAISE EXCEPTION 'A pending request of this type already exists';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  INSERT INTO permission_requests (group_id, user_id, user_email, type)
  VALUES (p_group_id, v_uid, v_email, p_type)
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_permission_request(uuid, text) TO authenticated;

-- ── 6. RPC: approve request → promotes member to editor ──────
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
  UPDATE shared_group_members SET role = 'editor' WHERE group_id = v_req.group_id AND user_id = v_req.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_permission_request(uuid) TO authenticated;

-- ── 7. RPC: reject permission request ────────────────────────
CREATE OR REPLACE FUNCTION public.reject_permission_request(p_request_id uuid)
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
  IF v_owner != auth.uid() THEN RAISE EXCEPTION 'Only the group owner can reject requests'; END IF;

  UPDATE permission_requests SET status = 'rejected' WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_permission_request(uuid) TO authenticated;
