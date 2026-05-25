import { createClient } from '@/lib/supabase/client'
import { Category, CategoryFormData } from '@/types'

/** Returns default + user-specific categories ordered: defaults first, then user's by created_at. */
export async function getCategories(): Promise<Category[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createCategory(formData: CategoryFormData): Promise<Category> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: user.id, ...formData, is_default: false })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateCategory(id: string, formData: Partial<CategoryFormData>): Promise<Category> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('categories')
    .update(formData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}
