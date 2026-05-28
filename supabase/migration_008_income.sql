-- ============================================================
-- Migration 008: Income tracking system
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. income_sources ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_sources (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  emoji      text        NOT NULL DEFAULT '💰',
  color      text        NOT NULL DEFAULT '#10B981',
  is_default boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON income_sources TO authenticated;

ALTER TABLE income_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "is_select" ON income_sources;
DROP POLICY IF EXISTS "is_insert" ON income_sources;
DROP POLICY IF EXISTS "is_update" ON income_sources;
DROP POLICY IF EXISTS "is_delete" ON income_sources;

-- Defaults (user_id IS NULL) are readable by everyone; own rows by owner
CREATE POLICY "is_select" ON income_sources
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = (select auth.uid()));

CREATE POLICY "is_insert" ON income_sources
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND is_default = false);

CREATE POLICY "is_update" ON income_sources
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()) AND is_default = false);

CREATE POLICY "is_delete" ON income_sources
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()) AND is_default = false);

-- Unique index so re-running this migration never duplicates defaults.
-- (id is gen_random_uuid() — ON CONFLICT (id) would never fire.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_income_sources_global_name
  ON income_sources(lower(name))
  WHERE user_id IS NULL;

-- Seed default sources (safe to re-run)
INSERT INTO income_sources (user_id, name, emoji, color, is_default)
VALUES
  (NULL, 'Salary',      '💼', '#3B82F6', true),
  (NULL, 'Freelance',   '💻', '#8B5CF6', true),
  (NULL, 'Bonus',       '🎁', '#F59E0B', true),
  (NULL, 'Investments', '📈', '#10B981', true),
  (NULL, 'Business',    '🏢', '#EF4444', true)
ON CONFLICT (lower(name)) WHERE user_id IS NULL DO NOTHING;

-- ── 2. income_entries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_entries (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  income_source_id uuid          NOT NULL REFERENCES income_sources(id),
  amount           numeric(12,2) NOT NULL CHECK (amount > 0),
  note             text          NOT NULL DEFAULT '',
  received_at      timestamptz   NOT NULL DEFAULT now(),
  created_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_income_entries_user_received
  ON income_entries(user_id, received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON income_entries TO authenticated;

ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ie_select" ON income_entries;
DROP POLICY IF EXISTS "ie_insert" ON income_entries;
DROP POLICY IF EXISTS "ie_update" ON income_entries;
DROP POLICY IF EXISTS "ie_delete" ON income_entries;

CREATE POLICY "ie_select" ON income_entries
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "ie_insert" ON income_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "ie_update" ON income_entries
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "ie_delete" ON income_entries
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
