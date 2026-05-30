-- ============================================================
-- Migration 046: Wishlist module
-- Run this in the Supabase SQL editor after migration 045.
-- ============================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS item text;

UPDATE public.budgets
  SET item = category
  WHERE item IS NULL OR length(trim(item)) = 0;

ALTER TABLE public.budgets
  ALTER COLUMN item SET NOT NULL;

ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_user_id_category_month_year_key,
  DROP CONSTRAINT IF EXISTS budgets_item_check;

ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_item_check CHECK (length(trim(item)) > 0),
  ADD CONSTRAINT budgets_user_category_item_month_year_key UNIQUE (user_id, category, item, month, year);

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (length(trim(name)) > 0),
  target_amount    numeric(12, 2) NOT NULL CHECK (target_amount > 0),
  category         text NOT NULL CHECK (length(trim(category)) > 0),
  priority         text CHECK (priority IN ('high', 'medium', 'low')),
  notes            text NOT NULL DEFAULT '',
  product_url      text,
  quantity         integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status           text NOT NULL DEFAULT 'wishlist' CHECK (status IN ('wishlist', 'budgeted', 'purchased', 'cancelled')),
  linked_budget_id uuid REFERENCES public.budgets(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wishlist_items_user_status_idx
  ON public.wishlist_items(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS wishlist_items_linked_budget_idx
  ON public.wishlist_items(linked_budget_id)
  WHERE linked_budget_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO authenticated;

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wishlist_items_select" ON public.wishlist_items;
DROP POLICY IF EXISTS "wishlist_items_insert" ON public.wishlist_items;
DROP POLICY IF EXISTS "wishlist_items_update" ON public.wishlist_items;
DROP POLICY IF EXISTS "wishlist_items_delete" ON public.wishlist_items;

CREATE POLICY "wishlist_items_select" ON public.wishlist_items
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "wishlist_items_insert" ON public.wishlist_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "wishlist_items_update" ON public.wishlist_items
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "wishlist_items_delete" ON public.wishlist_items
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.set_wishlist_items_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wishlist_items_updated_at ON public.wishlist_items;
CREATE TRIGGER trg_wishlist_items_updated_at
  BEFORE UPDATE ON public.wishlist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_wishlist_items_updated_at();

CREATE OR REPLACE FUNCTION public.convert_wishlist_to_budget(
  p_wishlist_id uuid,
  p_month smallint,
  p_year smallint
)
RETURNS wishlist_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wishlist wishlist_items;
  v_budget budgets;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_wishlist
  FROM wishlist_items
  WHERE id = p_wishlist_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Wishlist item not found'; END IF;
  IF v_wishlist.status IN ('purchased', 'cancelled') THEN
    RAISE EXCEPTION 'Only active wishlist items can be converted to a budget.';
  END IF;

  INSERT INTO budgets (user_id, category, item, amount, month, year)
  VALUES (
    v_uid,
    v_wishlist.category,
    v_wishlist.name,
    v_wishlist.target_amount,
    p_month,
    p_year
  )
  ON CONFLICT (user_id, category, item, month, year)
  DO UPDATE SET amount = EXCLUDED.amount
  RETURNING * INTO v_budget;

  UPDATE wishlist_items
    SET status = 'budgeted',
        linked_budget_id = v_budget.id
    WHERE id = p_wishlist_id
      AND user_id = v_uid
    RETURNING * INTO v_wishlist;

  RETURN v_wishlist;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_wishlist_to_budget(uuid, smallint, smallint) TO authenticated;

NOTIFY pgrst, 'reload schema';
