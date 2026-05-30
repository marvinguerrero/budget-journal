-- ============================================================
-- Migration 038: Custom financial account types
-- Run this in the Supabase SQL editor after migration 037.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financial_account_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  category    text NOT NULL CHECK (category IN ('asset', 'liability')),
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fat_user_category_idx ON public.financial_account_types(user_id, category, lower(name));
CREATE INDEX IF NOT EXISTS fat_default_category_idx ON public.financial_account_types(category, lower(name)) WHERE is_default = true;
CREATE UNIQUE INDEX IF NOT EXISTS fat_user_name_unique_idx
  ON public.financial_account_types(user_id, lower(name))
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fat_default_name_unique_idx
  ON public.financial_account_types(lower(name), category)
  WHERE is_default = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_account_types TO authenticated;

ALTER TABLE public.financial_account_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fat_select" ON public.financial_account_types;
DROP POLICY IF EXISTS "fat_insert" ON public.financial_account_types;
DROP POLICY IF EXISTS "fat_update" ON public.financial_account_types;
DROP POLICY IF EXISTS "fat_delete" ON public.financial_account_types;

CREATE POLICY "fat_select" ON public.financial_account_types
  FOR SELECT TO authenticated
  USING (is_default = true OR user_id = (select auth.uid()));

CREATE POLICY "fat_insert" ON public.financial_account_types
  FOR INSERT TO authenticated
  WITH CHECK (is_default = false AND user_id = (select auth.uid()));

CREATE POLICY "fat_update" ON public.financial_account_types
  FOR UPDATE TO authenticated
  USING (is_default = false AND user_id = (select auth.uid()))
  WITH CHECK (is_default = false AND user_id = (select auth.uid()));

CREATE POLICY "fat_delete" ON public.financial_account_types
  FOR DELETE TO authenticated
  USING (is_default = false AND user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.set_financial_account_types_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_account_types_updated_at ON public.financial_account_types;
CREATE TRIGGER trg_financial_account_types_updated_at
  BEFORE UPDATE ON public.financial_account_types
  FOR EACH ROW EXECUTE FUNCTION public.set_financial_account_types_updated_at();

INSERT INTO public.financial_account_types (user_id, name, category, is_default)
VALUES
  (NULL, 'Bank', 'asset', true),
  (NULL, 'Savings', 'asset', true),
  (NULL, 'E-Wallet', 'asset', true),
  (NULL, 'Investment', 'asset', true),
  (NULL, 'Cash', 'asset', true),
  (NULL, 'Credit Card', 'liability', true),
  (NULL, 'Loan', 'liability', true)
ON CONFLICT DO NOTHING;

ALTER TABLE public.financial_accounts
  DROP CONSTRAINT IF EXISTS financial_accounts_type_check;

CREATE OR REPLACE FUNCTION public.delete_financial_account_type(p_type_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type financial_account_types;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_type
  FROM financial_account_types
  WHERE id = p_type_id
    AND (is_default = true OR user_id = v_uid);

  IF NOT FOUND THEN RAISE EXCEPTION 'Account type not found'; END IF;
  IF v_type.is_default THEN
    RAISE EXCEPTION 'Default account types cannot be deleted.';
  END IF;
  IF v_type.user_id != v_uid THEN
    RAISE EXCEPTION 'Account type not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM financial_accounts
    WHERE user_id = v_uid
      AND type = v_type.name
  ) THEN
    RAISE EXCEPTION 'This account type is currently being used by one or more financial accounts.';
  END IF;

  DELETE FROM financial_account_types
  WHERE id = p_type_id
    AND user_id = v_uid
    AND is_default = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_financial_account_type(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
