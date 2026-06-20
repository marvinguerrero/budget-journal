import { createClient } from '@/lib/supabase/client'
import { IncomeEntry, IncomeEntryFormData } from '@/types'
import { createActionTrace } from '@/lib/performance'

export async function getIncomeEntries(month?: number, year?: number): Promise<IncomeEntry[]> {
  const supabase = createClient()
  let query = supabase
    .from('income_entries')
    .select('*')
    .order('received_at', { ascending: false })

  if (month && year) {
    const start = new Date(year, month - 1, 1).toISOString()
    const end   = new Date(year, month,     0, 23, 59, 59).toISOString()
    query = query.gte('received_at', start).lte('received_at', end)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createIncomeEntry(form: IncomeEntryFormData): Promise<IncomeEntry> {
  const trace = createActionTrace('service.income.create', { status: form.status ?? 'expected' })
  const supabase = createClient()
  try {
    const { data: { user } } = await trace.step('supabase.auth.get_user', () => supabase.auth.getUser())
    if (!user) throw new Error('Not authenticated')
    const { data, error } = await trace.step('supabase.insert.income_entry_with_balance_trigger', () =>
      supabase
        .from('income_entries')
        .insert({ user_id: user.id, status: 'expected', ...form })
        .select()
        .single()
    )
    if (error) throw error
    return data
  } finally {
    trace.end()
  }
}

export async function updateIncomeEntry(
  id: string,
  form: Partial<IncomeEntryFormData>
): Promise<IncomeEntry> {
  const trace = createActionTrace('service.income.update')
  const supabase = createClient()
  try {
    const { data, error } = await trace.step('supabase.update.income_entry_with_balance_trigger', () =>
      supabase
        .from('income_entries')
        .update(form)
        .eq('id', id)
        .select()
        .single()
    )
    if (error) throw error
    return data
  } finally {
    trace.end()
  }
}

export async function deleteIncomeEntry(id: string): Promise<void> {
  const trace = createActionTrace('service.income.delete')
  const supabase = createClient()
  try {
    const { error } = await trace.step('supabase.delete.income_entry_with_balance_trigger', () =>
      supabase.from('income_entries').delete().eq('id', id)
    )
    if (error) throw error
  } finally {
    trace.end()
  }
}
