-- ============================================================
-- Migration 042: Fix shared budget category reuse
-- Run this in the Supabase SQL editor after migration 041.
-- ============================================================

-- Categories are reusable. Only the same category + item in the same group is unique.

ALTER TABLE public.shared_budgets
  ADD COLUMN IF NOT EXISTS item text;

UPDATE public.shared_budgets
  SET item = category
  WHERE item IS NULL OR length(trim(item)) = 0;

ALTER TABLE public.shared_budgets
  ALTER COLUMN item SET NOT NULL;

ALTER TABLE public.shared_budgets
  DROP CONSTRAINT IF EXISTS shared_budgets_group_id_category_key,
  DROP CONSTRAINT IF EXISTS shared_budgets_item_check;

ALTER TABLE public.shared_budgets
  ADD CONSTRAINT shared_budgets_item_check CHECK (length(trim(item)) > 0);

DROP INDEX IF EXISTS public.shared_budgets_group_category_item_unique_idx;
CREATE UNIQUE INDEX shared_budgets_group_category_item_unique_idx
  ON public.shared_budgets(group_id, lower(category), lower(item));

NOTIFY pgrst, 'reload schema';
