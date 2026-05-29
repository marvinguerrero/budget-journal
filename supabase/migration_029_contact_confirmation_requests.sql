-- ============================================================
-- Migration 029: Contact confirmation requests
-- Run this in the Supabase SQL editor after migration 028.
-- ============================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS link_status text NOT NULL DEFAULT 'none'
    CHECK (link_status IN ('none', 'pending', 'connected', 'declined'));

UPDATE public.contacts
  SET link_status = CASE
    WHEN contact_type = 'registered' AND linked_user_id IS NOT NULL THEN 'connected'
    ELSE COALESCE(NULLIF(link_status, ''), 'none')
  END;

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  responded_at       timestamptz,
  UNIQUE (requester_user_id, target_user_id, status)
);

CREATE INDEX IF NOT EXISTS contact_requests_target_idx ON public.contact_requests(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_requests_requester_idx ON public.contact_requests(requester_user_id, created_at DESC);

GRANT SELECT ON public.contact_requests TO authenticated;

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_requests_select_involved" ON public.contact_requests;
CREATE POLICY "contact_requests_select_involved" ON public.contact_requests
  FOR SELECT TO authenticated
  USING (
    requester_user_id = (select auth.uid())
    OR target_user_id = (select auth.uid())
  );

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'chat_message',
    'group_invite',
    'permission_approved',
    'member_joined',
    'settlement_received',
    'settlement_confirmed',
    'settlement_rejected',
    'payment_source_pending',
    'contact_request'
  ));

CREATE OR REPLACE FUNCTION public.request_contact_connection(p_contact_id uuid)
RETURNS contact_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_contact contacts;
  v_request contact_requests;
  v_requester_email text;
  v_requester_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_contact
  FROM contacts
  WHERE id = p_contact_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found'; END IF;
  IF v_contact.linked_user_id IS NULL THEN
    RAISE EXCEPTION 'Contact is not linked to an app user';
  END IF;
  IF v_contact.linked_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot connect to yourself';
  END IF;

  UPDATE contacts
    SET contact_type = 'external',
        link_status = 'pending'
    WHERE id = p_contact_id
      AND user_id = v_uid;

  INSERT INTO contact_requests (requester_user_id, target_user_id, status)
  VALUES (v_uid, v_contact.linked_user_id, 'pending')
  ON CONFLICT (requester_user_id, target_user_id, status)
  DO UPDATE SET created_at = contact_requests.created_at
  RETURNING * INTO v_request;

  SELECT email INTO v_requester_email FROM profiles WHERE id = v_uid;
  v_requester_name := COALESCE(split_part(v_requester_email, '@', 1), 'Someone');

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    v_contact.linked_user_id,
    'contact_request',
    'Contact request',
    v_requester_name || ' wants to connect with you.',
    v_request.id
  );

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_contact_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_request contact_requests;
  v_requester_email text;
  v_target_email text;
  v_requester_name text;
  v_target_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_request
  FROM contact_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Contact request not found'; END IF;
  IF v_request.target_user_id != v_uid THEN
    RAISE EXCEPTION 'Only the target user can accept this request';
  END IF;
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Contact request has already been processed';
  END IF;

  UPDATE contact_requests
    SET status = 'accepted',
        responded_at = now()
    WHERE id = p_request_id;

  UPDATE contacts
    SET contact_type = 'registered',
        link_status = 'connected',
        linked_user_id = v_request.target_user_id
    WHERE user_id = v_request.requester_user_id
      AND linked_user_id = v_request.target_user_id
      AND link_status = 'pending';

  SELECT email INTO v_requester_email FROM profiles WHERE id = v_request.requester_user_id;
  SELECT email INTO v_target_email FROM profiles WHERE id = v_request.target_user_id;
  v_requester_name := COALESCE(split_part(v_requester_email, '@', 1), 'Contact');
  v_target_name := COALESCE(split_part(v_target_email, '@', 1), 'Contact');

  INSERT INTO contacts (
    user_id,
    name,
    email,
    contact_type,
    link_status,
    linked_user_id
  )
  SELECT
    v_request.target_user_id,
    v_requester_name,
    v_requester_email,
    'registered',
    'connected',
    v_request.requester_user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM contacts
    WHERE user_id = v_request.target_user_id
      AND linked_user_id = v_request.requester_user_id
      AND link_status = 'connected'
  );

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    v_request.requester_user_id,
    'contact_request',
    'Contact connected',
    v_target_name || ' accepted your contact request.',
    p_request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_contact_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_request contact_requests;
  v_target_email text;
  v_target_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_request
  FROM contact_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Contact request not found'; END IF;
  IF v_request.target_user_id != v_uid THEN
    RAISE EXCEPTION 'Only the target user can decline this request';
  END IF;
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Contact request has already been processed';
  END IF;

  UPDATE contact_requests
    SET status = 'declined',
        responded_at = now()
    WHERE id = p_request_id;

  UPDATE contacts
    SET contact_type = 'external',
        link_status = 'declined'
    WHERE user_id = v_request.requester_user_id
      AND linked_user_id = v_request.target_user_id
      AND link_status = 'pending';

  SELECT email INTO v_target_email FROM profiles WHERE id = v_request.target_user_id;
  v_target_name := COALESCE(split_part(v_target_email, '@', 1), 'Contact');

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    v_request.requester_user_id,
    'contact_request',
    'Contact request declined',
    v_target_name || ' declined your contact request.',
    p_request_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_contact_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_contact_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_contact_request(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
