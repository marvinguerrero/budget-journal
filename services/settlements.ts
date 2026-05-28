import { createClient } from '@/lib/supabase/client'
import { SharedExpenseSettlement } from '@/types'

export async function getGroupSettlements(groupId: string): Promise<SharedExpenseSettlement[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shared_expense_settlements')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createSettlement(payload: {
  groupId: string
  receiverUserId: string
  receiverEmail: string
  amount: number
  payerAccountId?: string | null
  note?: string
}): Promise<SharedExpenseSettlement> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: settlement, error: settleErr } = await supabase
    .from('shared_expense_settlements')
    .insert({
      group_id:         payload.groupId,
      payer_user_id:    user.id,
      payer_email:      user.email ?? '',
      receiver_user_id: payload.receiverUserId,
      receiver_email:   payload.receiverEmail,
      amount:           payload.amount,
      payer_account_id: payload.payerAccountId ?? null,
      note:             payload.note ?? '',
      status:           'pending_confirmation',
    })
    .select()
    .single()
  if (settleErr) throw settleErr

  // Create expense on payer's account so the balance deducts immediately
  if (payload.payerAccountId) {
    const receiverName = payload.receiverEmail.split('@')[0]
    const { data: expense, error: expErr } = await supabase
      .from('expenses')
      .insert({
        user_id:    user.id,
        amount:     payload.amount,
        category:   'Settlement',
        note:       `Settlement to ${receiverName}`,
        account_id: payload.payerAccountId,
      })
      .select()
      .single()
    if (expErr) throw expErr

    await supabase
      .from('shared_expense_settlements')
      .update({ expense_id: expense.id })
      .eq('id', settlement.id)

    return { ...settlement, expense_id: expense.id }
  }

  return settlement
}

export async function confirmSettlement(
  settlementId: string,
  receiverAccountId?: string | null,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('confirm_settlement', {
    p_settlement_id:      settlementId,
    p_receiver_account_id: receiverAccountId ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function rejectSettlement(settlementId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('reject_settlement', {
    p_settlement_id: settlementId,
  })
  if (error) throw new Error(error.message)
}
