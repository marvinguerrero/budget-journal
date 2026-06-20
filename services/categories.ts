import { createClient } from '@/lib/supabase/client'
import { Category, CategoryFormData } from '@/types'

const CATEGORY_SELECT = 'id, user_id, name, icon, color, is_default, created_at'
let categoryCache: Category[] | null = null

/** Returns default + user-specific categories ordered: defaults first, then user's by created_at. */
export async function getCategories(): Promise<Category[]> {
  if (categoryCache) return categoryCache
  const supabase = createClient()
  const { data, error } = await supabase
    .from('categories')
    .select(CATEGORY_SELECT)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  categoryCache = data || []
  return categoryCache
}

export async function createCategory(formData: CategoryFormData): Promise<Category> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: user.id, ...formData, is_default: false })
    .select(CATEGORY_SELECT)
    .single()

  if (error) throw error
  categoryCache = categoryCache ? [...categoryCache, data] : null
  return data
}

export async function updateCategory(id: string, formData: Partial<CategoryFormData>): Promise<Category> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('categories')
    .update(formData)
    .eq('id', id)
    .select(CATEGORY_SELECT)
    .single()

  if (error) throw error
  categoryCache = categoryCache ? categoryCache.map((category) => category.id === id ? data : category) : null
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
  categoryCache = categoryCache ? categoryCache.filter((category) => category.id !== id) : null
}
