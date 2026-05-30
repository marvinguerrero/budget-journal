-- ============================================================
-- Migration 047: Wishlist sharing
-- Run this in the Supabase SQL editor after migration 046.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wishlist_shares (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id          uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  mode                text NOT NULL CHECK (mode IN ('single', 'multiple', 'entire')),
  share_notes         boolean NOT NULL DEFAULT true,
  share_product_links boolean NOT NULL DEFAULT true,
  share_prices        boolean NOT NULL DEFAULT true,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wishlist_share_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id         uuid NOT NULL REFERENCES public.wishlist_shares(id) ON DELETE CASCADE,
  wishlist_item_id uuid NOT NULL REFERENCES public.wishlist_items(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (share_id, wishlist_item_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS wishlist_shares_active_recipient_idx
  ON public.wishlist_shares(owner_user_id, recipient_user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS wishlist_shares_owner_idx
  ON public.wishlist_shares(owner_user_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS wishlist_shares_recipient_idx
  ON public.wishlist_shares(recipient_user_id, is_active, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_share_items TO authenticated;

ALTER TABLE public.wishlist_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_share_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wishlist_shares_select_involved" ON public.wishlist_shares;
DROP POLICY IF EXISTS "wishlist_shares_insert_owner" ON public.wishlist_shares;
DROP POLICY IF EXISTS "wishlist_shares_update_owner" ON public.wishlist_shares;
DROP POLICY IF EXISTS "wishlist_shares_delete_owner" ON public.wishlist_shares;

CREATE POLICY "wishlist_shares_select_involved" ON public.wishlist_shares
  FOR SELECT TO authenticated
  USING (
    owner_user_id = (select auth.uid())
    OR recipient_user_id = (select auth.uid())
  );

CREATE POLICY "wishlist_shares_insert_owner" ON public.wishlist_shares
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = (select auth.uid()));

CREATE POLICY "wishlist_shares_update_owner" ON public.wishlist_shares
  FOR UPDATE TO authenticated
  USING (owner_user_id = (select auth.uid()))
  WITH CHECK (owner_user_id = (select auth.uid()));

CREATE POLICY "wishlist_shares_delete_owner" ON public.wishlist_shares
  FOR DELETE TO authenticated
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "wishlist_share_items_select_involved" ON public.wishlist_share_items;
DROP POLICY IF EXISTS "wishlist_share_items_owner_all" ON public.wishlist_share_items;

CREATE POLICY "wishlist_share_items_select_involved" ON public.wishlist_share_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.wishlist_shares ws
      WHERE ws.id = share_id
        AND (
          ws.owner_user_id = (select auth.uid())
          OR ws.recipient_user_id = (select auth.uid())
        )
    )
  );

CREATE POLICY "wishlist_share_items_owner_all" ON public.wishlist_share_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.wishlist_shares ws
      WHERE ws.id = share_id
        AND ws.owner_user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.wishlist_shares ws
      WHERE ws.id = share_id
        AND ws.owner_user_id = (select auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.set_wishlist_shares_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wishlist_shares_updated_at ON public.wishlist_shares;
CREATE TRIGGER trg_wishlist_shares_updated_at
  BEFORE UPDATE ON public.wishlist_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_wishlist_shares_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_wishlist_shares(
  p_contact_ids uuid[],
  p_mode text,
  p_item_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_share_notes boolean DEFAULT true,
  p_share_product_links boolean DEFAULT true,
  p_share_prices boolean DEFAULT true
)
RETURNS SETOF wishlist_shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_contact contacts;
  v_share wishlist_shares;
  v_contact_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_mode NOT IN ('single', 'multiple', 'entire') THEN RAISE EXCEPTION 'Invalid sharing mode'; END IF;
  IF p_mode != 'entire' AND COALESCE(array_length(p_item_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one wishlist item to share.';
  END IF;

  IF p_mode != 'entire' AND EXISTS (
    SELECT 1
    FROM unnest(p_item_ids) item_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM wishlist_items wi
      WHERE wi.id = item_id
        AND wi.user_id = v_uid
        AND wi.status != 'cancelled'
    )
  ) THEN
    RAISE EXCEPTION 'One or more wishlist items cannot be shared.';
  END IF;

  FOREACH v_contact_id IN ARRAY p_contact_ids LOOP
    SELECT * INTO v_contact
    FROM contacts
    WHERE id = v_contact_id
      AND user_id = v_uid
      AND contact_type = 'registered'
      AND link_status = 'connected'
      AND linked_user_id IS NOT NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only connected contacts can receive wishlist shares.';
    END IF;

    INSERT INTO wishlist_shares (
      owner_user_id,
      recipient_user_id,
      contact_id,
      mode,
      share_notes,
      share_product_links,
      share_prices,
      is_active
    )
    VALUES (
      v_uid,
      v_contact.linked_user_id,
      v_contact.id,
      p_mode,
      p_share_notes,
      p_share_product_links,
      p_share_prices,
      true
    )
    ON CONFLICT (owner_user_id, recipient_user_id) WHERE is_active = true
    DO UPDATE SET
      contact_id = EXCLUDED.contact_id,
      mode = EXCLUDED.mode,
      share_notes = EXCLUDED.share_notes,
      share_product_links = EXCLUDED.share_product_links,
      share_prices = EXCLUDED.share_prices,
      updated_at = now()
    RETURNING * INTO v_share;

    DELETE FROM wishlist_share_items
    WHERE share_id = v_share.id;

    IF p_mode != 'entire' THEN
      INSERT INTO wishlist_share_items (share_id, wishlist_item_id)
      SELECT v_share.id, item_id
      FROM unnest(p_item_ids) item_id
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEXT v_share;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_wishlist_share(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE wishlist_shares
    SET is_active = false
    WHERE id = p_share_id
      AND owner_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wishlist share not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_wishlist_shared_with_me()
RETURNS TABLE (
  share_id uuid,
  owner_user_id uuid,
  owner_name text,
  mode text,
  item_id uuid,
  name text,
  target_amount numeric,
  category text,
  priority text,
  notes text,
  product_url text,
  quantity integer,
  status text,
  share_notes boolean,
  share_product_links boolean,
  share_prices boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    ws.id AS share_id,
    ws.owner_user_id,
    COALESCE(c.name, split_part(p.email, '@', 1), 'Contact') AS owner_name,
    ws.mode,
    wi.id AS item_id,
    wi.name,
    CASE WHEN ws.share_prices THEN wi.target_amount ELSE NULL END AS target_amount,
    wi.category,
    wi.priority,
    CASE WHEN ws.share_notes THEN wi.notes ELSE '' END AS notes,
    CASE WHEN ws.share_product_links THEN wi.product_url ELSE NULL END AS product_url,
    wi.quantity,
    wi.status,
    ws.share_notes,
    ws.share_product_links,
    ws.share_prices
  FROM wishlist_shares ws
  JOIN wishlist_items wi
    ON wi.user_id = ws.owner_user_id
   AND wi.status != 'cancelled'
   AND (
     ws.mode = 'entire'
     OR EXISTS (
       SELECT 1
       FROM wishlist_share_items wsi
       WHERE wsi.share_id = ws.id
         AND wsi.wishlist_item_id = wi.id
     )
   )
  LEFT JOIN contacts c
    ON c.user_id = auth.uid()
   AND c.linked_user_id = ws.owner_user_id
   AND c.link_status = 'connected'
  LEFT JOIN profiles p
    ON p.id = ws.owner_user_id
  WHERE ws.recipient_user_id = auth.uid()
    AND ws.is_active = true
  ORDER BY owner_name, wi.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_wishlist_shares(uuid[], text, uuid[], boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_wishlist_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wishlist_shared_with_me() TO authenticated;

NOTIFY pgrst, 'reload schema';
