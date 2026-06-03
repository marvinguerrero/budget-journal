-- ============================================================
-- Migration 060: Shared wishlist item age metadata
-- Run this in the Supabase SQL editor after migration 059.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_wishlist_shared_with_me();

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
  created_at timestamptz,
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
    wi.created_at,
    ws.share_notes,
    ws.share_product_links,
    ws.share_prices
  FROM public.wishlist_shares ws
  JOIN public.wishlist_items wi
    ON wi.user_id = ws.owner_user_id
   AND wi.status != 'cancelled'
   AND (
     ws.mode = 'entire'
     OR EXISTS (
       SELECT 1
       FROM public.wishlist_share_items wsi
       WHERE wsi.share_id = ws.id
         AND wsi.wishlist_item_id = wi.id
     )
   )
  LEFT JOIN public.contacts c
    ON c.user_id = auth.uid()
   AND c.linked_user_id = ws.owner_user_id
   AND c.link_status = 'connected'
  LEFT JOIN public.profiles p
    ON p.id = ws.owner_user_id
  WHERE ws.recipient_user_id = auth.uid()
    AND ws.is_active = true
  ORDER BY owner_name, wi.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_wishlist_shared_with_me() TO authenticated;

NOTIFY pgrst, 'reload schema';
