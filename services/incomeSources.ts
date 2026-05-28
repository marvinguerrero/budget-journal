import { createClient } from '@/lib/supabase/client'
import { IncomeSource, IncomeSourceFormData } from '@/types'

export async function getIncomeSources(): Promise<IncomeSource[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('income_sources')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name')
  if (error) throw error
  return data || []
}

export async function createIncomeSource(form: IncomeSourceFormData): Promise<IncomeSource> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('income_sources')
    .insert({ user_id: user.id, ...form, is_default: false })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateIncomeSource(id: string, form: Partial<IncomeSourceFormData>): Promise<IncomeSource> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('income_sources')
    .update(form)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteIncomeSource(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('income_sources').delete().eq('id', id)
  if (error) throw error
}
