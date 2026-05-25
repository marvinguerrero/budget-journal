import { createClient } from '@/lib/supabase/client'
import { Budget, BudgetFormData } from '@/types'

export async function getBudgets(month: number, year: number): Promise<Budget[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('month', month)
    .eq('year', year)

  if (error) throw error
  return data || []
}

export async function createBudget(formData: BudgetFormData): Promise<Budget> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      {
        user_id: user.id,
        category: formData.category,
        amount: formData.amount,
        month: formData.month,
        year: formData.year,
      },
      { onConflict: 'user_id,category,month,year' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateBudget(id: string, amount: number): Promise<Budget> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('budgets')
    .update({ amount })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteBudget(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('budgets').delete().eq('id', id)
  if (error) throw error
}
