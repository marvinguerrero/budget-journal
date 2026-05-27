import { createClient } from '@/lib/supabase/client'
import { SharedExpense } from '@/types'

export async function createSharedExpense(
  groupId: string,
  category: string,
  amount: number,
  note: string
): Promise<SharedExpense> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('shared_expenses')
    .insert({
      group_id: groupId,
      user_id: user.id,
      user_email: user.email ?? '',
      category: category.trim(),
      amount,
      note: note.trim(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSharedExpense(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('shared_expenses').delete().eq('id', id)
  if (error) throw error
}
