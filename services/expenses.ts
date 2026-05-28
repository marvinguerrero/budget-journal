import { createClient } from '@/lib/supabase/client'
import { Expense, ExpenseFormData } from '@/types'

export async function getExpenses(month?: number, year?: number): Promise<Expense[]> {
  const supabase = createClient()
  let query = supabase
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: false })

  if (month && year) {
    const startDate = new Date(year, month - 1, 1).toISOString()
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()
    query = query.gte('created_at', startDate).lte('created_at', endDate)
  } else if (year) {
    const startDate = new Date(year, 0, 1).toISOString()
    const endDate = new Date(year, 11, 31, 23, 59, 59).toISOString()
    query = query.gte('created_at', startDate).lte('created_at', endDate)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getAllExpenses(): Promise<Expense[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createExpense(formData: ExpenseFormData): Promise<Expense> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      user_id: user.id,
      amount: formData.amount,
      category: formData.category,
      note: formData.note,
      account_id: formData.account_id || null,
      created_at: formData.created_at || new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateExpense(id: string, formData: Partial<ExpenseFormData>): Promise<Expense> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expenses')
    .update(formData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}
