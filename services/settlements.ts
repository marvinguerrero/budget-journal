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
  if (!payload.payerAccountId) throw new Error('Please select a source account.')

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
  return settlement
}

export async function confirmSettlement(
  settlementId: string,
  receiverAccountId?: string | null,
  amount?: number | null,
): Promise<void> {
  const supabase = createClient()
  if (!receiverAccountId) throw new Error('Please select a destination account.')
  const { error } = await supabase.rpc('confirm_settlement', {
    p_settlement_id:      settlementId,
    p_receiver_account_id: receiverAccountId ?? null,
    p_amount: amount ?? null,
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

export async function recallSettlement(settlementId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('recall_settlement', {
    p_settlement_id: settlementId,
  })
  if (error) throw new Error(error.message)
}

export async function undoConfirmSettlement(settlementId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('undo_confirm_settlement', {
    p_settlement_id: settlementId,
  })
  if (error) throw new Error(error.message)
}
