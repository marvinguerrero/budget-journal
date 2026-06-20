import { createClient } from '@/lib/supabase/client'
import { IncomeSource, IncomeSourceFormData } from '@/types'

const INCOME_SOURCE_SELECT = 'id, user_id, name, emoji, color, is_default, created_at'
let incomeSourceCache: IncomeSource[] | null = null

export async function getIncomeSources(): Promise<IncomeSource[]> {
  if (incomeSourceCache) return incomeSourceCache
  const supabase = createClient()
  const { data, error } = await supabase
    .from('income_sources')
    .select(INCOME_SOURCE_SELECT)
    .order('is_default', { ascending: false })
    .order('name')
  if (error) throw error
  incomeSourceCache = data || []
  return incomeSourceCache
}

export async function createIncomeSource(form: IncomeSourceFormData): Promise<IncomeSource> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('income_sources')
    .insert({ user_id: user.id, ...form, is_default: false })
    .select(INCOME_SOURCE_SELECT)
    .single()
  if (error) throw error
  incomeSourceCache = incomeSourceCache ? [...incomeSourceCache, data] : null
  return data
}

export async function updateIncomeSource(id: string, form: Partial<IncomeSourceFormData>): Promise<IncomeSource> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('income_sources')
    .update(form)
    .eq('id', id)
    .select(INCOME_SOURCE_SELECT)
    .single()
  if (error) throw error
  incomeSourceCache = incomeSourceCache ? incomeSourceCache.map((source) => source.id === id ? data : source) : null
  return data
}

export async function deleteIncomeSource(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('income_sources').delete().eq('id', id)
  if (error) throw error
  incomeSourceCache = incomeSourceCache ? incomeSourceCache.filter((source) => source.id !== id) : null
}
