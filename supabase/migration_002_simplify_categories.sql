-- ============================================================
-- Migration 002 – Simplify categories schema
-- Run in Supabase SQL Editor AFTER migration_001.
-- ============================================================

-- Categories: make color nullable (no longer required from UI)
ALTER TABLE public.categories
  ALTER COLUMN color SET DEFAULT '#6B7280',
  ALTER COLUMN color DROP NOT NULL;

-- Add emoji alias so both `icon` and `emoji` work during transition
-- (new code writes to `icon`, this just documents intent)
COMMENT ON COLUMN public.categories.icon IS 'Emoji for the category (e.g. ☕, 🍕)';
COMMENT ON COLUMN public.categories.color IS 'Accent color — defaults to #6B7280, not shown in UI';

-- Ensure user-created categories have a color fallback
UPDATE public.categories
  SET color = '#6B7280'
  WHERE color IS NULL;
