import { createClient } from '@/lib/supabase/client'
import { SharedExpense, SharedExpenseSplit, SplitMode } from '@/types'

export interface SplitInput {
  user_id: string
  email: string
  amount: number
}

export async function createSharedExpense(
  groupId: string,
  category: string,
  amount: number,
  note: string,
  paidByUserId: string,
  paidByEmail: string,
  splitMode: SplitMode,
  splits: SplitInput[]
): Promise<{ expense: SharedExpense; splits: SharedExpenseSplit[] }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: expense, error } = await supabase
    .from('shared_expenses')
    .insert({
      group_id:         groupId,
      user_id:          user.id,
      user_email:       user.email ?? '',
      category:         category.trim(),
      amount,
      note:             note.trim(),
      paid_by_user_id:  paidByUserId,
      paid_by_email:    paidByEmail,
      split_mode:       splitMode,
    })
    .select()
    .single()
  if (error) throw error

  if (splits.length === 0) return { expense, splits: [] }

  const { data: insertedSplits, error: splitErr } = await supabase
    .from('shared_expense_splits')
    .insert(splits.map((s) => ({
      expense_id:     expense.id,
      debtor_user_id: s.user_id,
      debtor_email:   s.email,
      amount:         s.amount,
    })))
    .select()
  if (splitErr) throw splitErr

  return { expense, splits: insertedSplits ?? [] }
}

export async function updateSharedExpense(
  id: string,
  category: string,
  amount: number,
  note: string,
  paidByUserId: string,
  paidByEmail: string,
  splitMode: SplitMode,
  splits: SplitInput[]
): Promise<SharedExpenseSplit[]> {
  const supabase = createClient()

  const { error } = await supabase.rpc('update_shared_expense', {
    p_expense_id:      id,
    p_category:        category.trim(),
    p_amount:          amount,
    p_note:            note.trim(),
    p_paid_by_user_id: paidByUserId,
    p_paid_by_email:   paidByEmail,
    p_split_mode:      splitMode,
  })
  if (error) throw new Error(error.message)

  // Replace splits
  await supabase.from('shared_expense_splits').delete().eq('expense_id', id)

  if (splits.length === 0) return []

  const { data: insertedSplits, error: splitErr } = await supabase
    .from('shared_expense_splits')
    .insert(splits.map((s) => ({
      expense_id:     id,
      debtor_user_id: s.user_id,
      debtor_email:   s.email,
      amount:         s.amount,
    })))
    .select()
  if (splitErr) throw splitErr

  return insertedSplits ?? []
}

export async function deleteSharedExpense(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('shared_expenses').delete().eq('id', id)
  if (error) throw error
}
