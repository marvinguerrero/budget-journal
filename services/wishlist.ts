import { createClient } from '@/lib/supabase/client'
import {
  SharedWishlistItem,
  WishlistFormData,
  WishlistItem,
  WishlistShare,
  WishlistShareMode,
  WishlistStatus,
} from '@/types'

const WISHLIST_SELECT = '*, budgets(*)'

function normalizeUrl(url?: string | null) {
  const value = url?.trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    return parsed.toString()
  } catch {
    throw new Error('Please enter a valid product URL.')
  }
}

export async function getWishlistItems(): Promise<WishlistItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('wishlist_items')
    .select(WISHLIST_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createWishlistItem(form: WishlistFormData): Promise<WishlistItem> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('wishlist_items')
    .insert({
      user_id: user.id,
      name: form.name.trim(),
      target_amount: form.target_amount,
      category: form.category.trim(),
      priority: form.priority ?? 'medium',
      notes: form.notes?.trim() ?? '',
      product_url: normalizeUrl(form.product_url),
      quantity: form.quantity ?? 1,
    })
    .select(WISHLIST_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function updateWishlistItem(
  id: string,
  form: Partial<WishlistFormData>
): Promise<WishlistItem> {
  const supabase = createClient()
  const updates = {
    ...(form.name !== undefined ? { name: form.name.trim() } : {}),
    ...(form.target_amount !== undefined ? { target_amount: form.target_amount } : {}),
    ...(form.category !== undefined ? { category: form.category.trim() } : {}),
    ...(form.priority !== undefined ? { priority: form.priority } : {}),
    ...(form.notes !== undefined ? { notes: form.notes?.trim() ?? '' } : {}),
    ...(form.product_url !== undefined ? { product_url: normalizeUrl(form.product_url) } : {}),
    ...(form.quantity !== undefined ? { quantity: form.quantity } : {}),
  }

  const { data, error } = await supabase
    .from('wishlist_items')
    .update(updates)
    .eq('id', id)
    .select(WISHLIST_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function updateWishlistStatus(
  id: string,
  status: Extract<WishlistStatus, 'wishlist' | 'purchased' | 'cancelled'>
): Promise<WishlistItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('wishlist_items')
    .update({ status })
    .eq('id', id)
    .select(WISHLIST_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function convertWishlistToBudget(
  id: string,
  month: number,
  year: number
): Promise<WishlistItem> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('convert_wishlist_to_budget', {
    p_wishlist_id: id,
    p_month: month,
    p_year: year,
  })

  if (error) throw new Error(error.message)

  const { data: item, error: itemError } = await supabase
    .from('wishlist_items')
    .select(WISHLIST_SELECT)
    .eq('id', data.id)
    .single()

  if (itemError) throw itemError
  return item
}

export async function getWishlistShares(): Promise<WishlistShare[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('wishlist_shares')
    .select('*, contacts(*), wishlist_share_items(wishlist_item_id)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function shareWishlist(payload: {
  contactIds: string[]
  mode: WishlistShareMode
  itemIds: string[]
  shareNotes: boolean
  shareProductLinks: boolean
  sharePrices: boolean
}): Promise<WishlistShare[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('upsert_wishlist_shares', {
    p_contact_ids: payload.contactIds,
    p_mode: payload.mode,
    p_item_ids: payload.itemIds,
    p_share_notes: payload.shareNotes,
    p_share_product_links: payload.shareProductLinks,
    p_share_prices: payload.sharePrices,
  })

  if (error) throw new Error(error.message)
  return data || []
}

export async function stopWishlistShare(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('stop_wishlist_share', {
    p_share_id: id,
  })
  if (error) throw new Error(error.message)
}

export async function getSharedWishlistItems(): Promise<SharedWishlistItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_wishlist_shared_with_me')
  if (error) throw new Error(error.message)
  return data || []
}
