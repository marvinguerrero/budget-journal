import { createClient } from '@/lib/supabase/client'
import { SharedExpense, SharedExpenseSplit, SplitMode, PaymentSourceStatus } from '@/types'

export interface SplitInput {
  user_id: string
  email: string
  amount: number
}

export async function createSharedExpense(
  groupId: string,
  sharedBudgetId: string,
  _category: string,
  amount: number,
  note: string,
  paidByUserId: string,
  paidByEmail: string,
  splitMode: SplitMode,
  splits: SplitInput[],
  accountId?: string | null,
  _paymentSourceStatus?: PaymentSourceStatus,
): Promise<{ expense: SharedExpense; splits: SharedExpenseSplit[] }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (paidByUserId === user.id && !accountId) throw new Error('Please select a source account.')
  if (!sharedBudgetId) throw new Error('Please select a budget item.')

  const { data: budget, error: budgetErr } = await supabase
    .from('shared_budgets')
    .select('id, group_id, category, item')
    .eq('id', sharedBudgetId)
    .eq('group_id', groupId)
    .single()

  if (budgetErr) throw new Error('Budget item not found')

  let canonicalExpenseId: string | null = null
  let sharedExpenseId: string | null = null
  const nextPaymentSourceStatus: PaymentSourceStatus = paidByUserId === user.id ? 'confirmed' : 'pending'

  try {
    if (paidByUserId === user.id) {
      const { data: canonicalExpense, error: canonicalErr } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          amount,
          category: budget.category,
          note: note.trim(),
          account_id: accountId,
          created_at: new Date().toISOString(),
          shared_group_id: groupId,
          shared_budget_id: sharedBudgetId,
          shared_budget_item: budget.item,
          is_shared_budget_expense: true,
        })
        .select('id')
        .single()

      if (canonicalErr) throw canonicalErr
      canonicalExpenseId = canonicalExpense.id
    }

    const { data: expense, error } = await supabase
      .from('shared_expenses')
      .insert({
        group_id:              groupId,
        shared_budget_id:      sharedBudgetId,
        user_id:               user.id,
        user_email:            user.email ?? '',
        category:              budget.category,
        amount,
        note:                  note.trim(),
        paid_by_user_id:       paidByUserId,
        paid_by_email:         paidByEmail,
        split_mode:            splitMode,
        account_id:            paidByUserId === user.id ? accountId ?? null : null,
        payment_source_status: nextPaymentSourceStatus,
        expense_id:            canonicalExpenseId,
      })
      .select()
      .single()
    if (error) throw error
    sharedExpenseId = expense.id

    if (canonicalExpenseId) {
      const { error: linkErr } = await supabase
        .from('expenses')
        .update({ shared_expense_id: expense.id })
        .eq('id', canonicalExpenseId)
      if (linkErr) throw linkErr
    }

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
  } catch (err) {
    if (sharedExpenseId) {
      await supabase.from('shared_expenses').delete().eq('id', sharedExpenseId)
    }
    if (canonicalExpenseId) {
      await supabase.from('expenses').delete().eq('id', canonicalExpenseId)
    }
    throw err
  }
}

export async function updateSharedExpense(
  id: string,
  sharedBudgetId: string,
  category: string,
  amount: number,
  note: string,
  paidByUserId: string,
  paidByEmail: string,
  splitMode: SplitMode,
  splits: SplitInput[],
  accountId?: string | null,
  paymentSourceStatus?: PaymentSourceStatus,
): Promise<SharedExpenseSplit[]> {
  const supabase = createClient()
  if (!sharedBudgetId) throw new Error('Please select a budget item.')

  const { error } = await supabase.rpc('update_shared_expense', {
    p_expense_id:            id,
    p_category:              category.trim(),
    p_amount:                amount,
    p_note:                  note.trim(),
    p_paid_by_user_id:       paidByUserId,
    p_paid_by_email:         paidByEmail,
    p_split_mode:            splitMode,
    p_account_id:            accountId ?? null,
    p_payment_source_status: paymentSourceStatus ?? 'confirmed',
    p_shared_budget_id:      sharedBudgetId,
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

export async function confirmPaymentSource(
  expenseId: string,
  accountId?: string | null,
): Promise<void> {
  const supabase = createClient()
  if (!accountId) throw new Error('Please select a source account.')
  const { error } = await supabase.rpc('confirm_payment_source', {
    p_expense_id: expenseId,
    p_account_id: accountId ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function deleteSharedExpense(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('delete_shared_expense_consistent', {
    p_expense_id: id,
  })
  if (error) throw new Error(error.message)
}
