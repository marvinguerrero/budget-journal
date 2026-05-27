import { createClient } from '@/lib/supabase/client'
import { SharedBudget } from '@/types'

export async function createSharedBudget(
  groupId: string,
  category: string,
  amount: number
): Promise<SharedBudget> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shared_budgets')
    .upsert(
      { group_id: groupId, category: category.trim(), amount },
      { onConflict: 'group_id,category' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSharedBudget(id: string, amount: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('update_shared_budget', {
    p_budget_id: id,
    p_amount:    amount,
  })
  if (error) throw new Error(error.message)
}

export async function deleteSharedBudget(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('shared_budgets').delete().eq('id', id)
  if (error) throw error
}
