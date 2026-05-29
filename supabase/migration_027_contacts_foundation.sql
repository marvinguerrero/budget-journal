-- ============================================================
-- Migration 027: Contacts foundation
-- Run this in the Supabase SQL editor after migration 026.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  email           text,
  phone           text,
  notes           text,
  contact_type    text NOT NULL DEFAULT 'external' CHECK (contact_type IN ('external', 'registered')),
  linked_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_user_name_idx ON public.contacts(user_id, lower(name));
CREATE INDEX IF NOT EXISTS contacts_user_email_idx ON public.contacts(user_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_linked_user_idx ON public.contacts(linked_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete_own" ON public.contacts;

CREATE POLICY "contacts_select_own" ON public.contacts
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "contacts_insert_own" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "contacts_update_own" ON public.contacts
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "contacts_delete_own" ON public.contacts
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.set_contacts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_contacts_updated_at();

ALTER TABLE public.personal_obligations
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS po_contact_id_idx ON public.personal_obligations(contact_id);

NOTIFY pgrst, 'reload schema';
