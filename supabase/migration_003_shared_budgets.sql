-- ============================================================
-- Migration 003: Shared Budget Groups
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 0. grant schema access ──────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ── 1. profiles (user email lookup for invite) ──────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill existing users
INSERT INTO profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ── 2. shared_groups ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  emoji      text NOT NULL DEFAULT '👥',
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON shared_groups TO authenticated;

ALTER TABLE shared_groups ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS shared_groups_owner_idx ON shared_groups(owner_id);

-- ── 3. shared_group_members ─────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_group_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (group_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON shared_group_members TO authenticated;

ALTER TABLE shared_group_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sgm_group_idx  ON shared_group_members(group_id);
CREATE INDEX IF NOT EXISTS sgm_user_idx   ON shared_group_members(user_id);

-- ── 4. membership helper (used by all RLS policies) ─────────
CREATE OR REPLACE FUNCTION is_group_member_or_owner(p_group_id uuid)
RETURNS boolean AS $$
  SELECT
    EXISTS (SELECT 1 FROM shared_groups        WHERE id       = p_group_id AND owner_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM shared_group_members WHERE group_id = p_group_id AND user_id  = auth.uid())
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 5. shared_groups RLS ────────────────────────────────────
DROP POLICY IF EXISTS "sg_select" ON shared_groups;
DROP POLICY IF EXISTS "sg_insert" ON shared_groups;
DROP POLICY IF EXISTS "sg_update" ON shared_groups;
DROP POLICY IF EXISTS "sg_delete" ON shared_groups;

CREATE POLICY "sg_select" ON shared_groups
  FOR SELECT TO authenticated USING (is_group_member_or_owner(id));

CREATE POLICY "sg_insert" ON shared_groups
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "sg_update" ON shared_groups
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "sg_delete" ON shared_groups
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ── 6. shared_group_members RLS ─────────────────────────────
DROP POLICY IF EXISTS "sgm_select" ON shared_group_members;
DROP POLICY IF EXISTS "sgm_insert" ON shared_group_members;
DROP POLICY IF EXISTS "sgm_delete" ON shared_group_members;

CREATE POLICY "sgm_select" ON shared_group_members
  FOR SELECT TO authenticated USING (is_group_member_or_owner(group_id));

CREATE POLICY "sgm_insert" ON shared_group_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = auth.uid()));

CREATE POLICY "sgm_delete" ON shared_group_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = auth.uid())
  );

-- ── 7. shared_budgets ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_budgets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  category   text NOT NULL,
  amount     numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE (group_id, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON shared_budgets TO authenticated;

ALTER TABLE shared_budgets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sb_group_idx ON shared_budgets(group_id);

DROP POLICY IF EXISTS "sb_select" ON shared_budgets;
DROP POLICY IF EXISTS "sb_insert" ON shared_budgets;
DROP POLICY IF EXISTS "sb_update" ON shared_budgets;
DROP POLICY IF EXISTS "sb_delete" ON shared_budgets;

CREATE POLICY "sb_select" ON shared_budgets
  FOR SELECT TO authenticated USING (is_group_member_or_owner(group_id));

CREATE POLICY "sb_insert" ON shared_budgets
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = auth.uid()));

CREATE POLICY "sb_update" ON shared_budgets
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = auth.uid()));

CREATE POLICY "sb_delete" ON shared_budgets
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = auth.uid()));

-- ── 8. shared_expenses ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_expenses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  category   text NOT NULL,
  amount     numeric NOT NULL CHECK (amount > 0),
  note       text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON shared_expenses TO authenticated;

ALTER TABLE shared_expenses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS se_group_idx ON shared_expenses(group_id);

DROP POLICY IF EXISTS "se_select" ON shared_expenses;
DROP POLICY IF EXISTS "se_insert" ON shared_expenses;
DROP POLICY IF EXISTS "se_delete" ON shared_expenses;

CREATE POLICY "se_select" ON shared_expenses
  FOR SELECT TO authenticated USING (is_group_member_or_owner(group_id));

CREATE POLICY "se_insert" ON shared_expenses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_group_member_or_owner(group_id));

CREATE POLICY "se_delete" ON shared_expenses
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = auth.uid())
  );
