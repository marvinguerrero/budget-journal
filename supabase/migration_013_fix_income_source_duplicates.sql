-- ============================================================
-- Migration 013: Fix duplicate income_sources rows
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Remove duplicate global default sources ────────────────
-- Keep the oldest row per name; delete any extras that crept in
-- from re-running migration_008 (ON CONFLICT (id) never fires
-- because id is gen_random_uuid(), so every re-run inserted 5
-- more rows).
DELETE FROM income_sources
WHERE user_id IS NULL
  AND id NOT IN (
    SELECT DISTINCT ON (lower(name)) id
    FROM income_sources
    WHERE user_id IS NULL
    ORDER BY lower(name), created_at ASC
  );

-- ── 2. Remove duplicate user-created sources (same user + name) ─
DELETE FROM income_sources
WHERE user_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (user_id, lower(name)) id
    FROM income_sources
    WHERE user_id IS NOT NULL
    ORDER BY user_id, lower(name), created_at ASC
  );

-- ── 3. Add unique indexes to prevent future duplicates ────────
-- Global defaults: unique by name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_income_sources_global_name
  ON income_sources(lower(name))
  WHERE user_id IS NULL;

-- Per-user custom sources: unique by (user_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS uq_income_sources_user_name
  ON income_sources(user_id, lower(name))
  WHERE user_id IS NOT NULL;

-- ── 4. Re-seed defaults using the new constraint ──────────────
-- Safe to re-run: ON CONFLICT now resolves correctly.
INSERT INTO income_sources (user_id, name, emoji, color, is_default)
VALUES
  (NULL, 'Salary',      '💼', '#3B82F6', true),
  (NULL, 'Freelance',   '💻', '#8B5CF6', true),
  (NULL, 'Bonus',       '🎁', '#F59E0B', true),
  (NULL, 'Investments', '📈', '#10B981', true),
  (NULL, 'Business',    '🏢', '#EF4444', true)
ON CONFLICT (lower(name)) WHERE user_id IS NULL DO NOTHING;
