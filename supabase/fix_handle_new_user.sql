-- ============================================================
-- Fix: "database error saving new user" on signup
-- Cause: handle_new_user trigger missing SET search_path,
--        and profiles_insert RLS policy blocks the service role.
-- Run this in the Supabase SQL editor.
-- ============================================================

-- 1. Recreate the trigger function with correct security settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Grant execute to supabase_auth_admin (the role that fires auth triggers)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- 2. Re-attach the trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Fix profiles RLS — also allow service_role so the trigger can always insert
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT
  WITH CHECK (
    id = (select auth.uid())          -- normal authenticated insert
    OR (select auth.uid()) IS NULL    -- trigger/service_role context (no JWT)
  );

-- 4. Backfill any auth users who are missing a profile row
INSERT INTO public.profiles (id, email)
SELECT id, COALESCE(email, '') FROM auth.users
ON CONFLICT (id) DO NOTHING;
