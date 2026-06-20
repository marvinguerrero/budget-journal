import { createClient } from '@/lib/supabase/client'
import { SharedExpenseSettlement } from '@/types'
import { createActionTrace } from '@/lib/performance'

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
  const trace = createActionTrace('service.shared_settlement.create')
  const supabase = createClient()
  try {
    const { data: { user } } = await trace.step('supabase.auth.get_user', () => supabase.auth.getUser())
    if (!user) throw new Error('Not authenticated')
    if (!payload.payerAccountId) throw new Error('Please select a source account.')

    const { data: settlement, error: settleErr } = await trace.step('supabase.insert.shared_settlement', () =>
      supabase
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
    )
    if (settleErr) throw settleErr
    return settlement
  } finally {
    trace.end()
  }
}

export async function confirmSettlement(
  settlementId: string,
  receiverAccountId?: string | null,
  amount?: number | null,
): Promise<void> {
  const trace = createActionTrace('service.shared_settlement.confirm')
  const supabase = createClient()
  try {
    if (!receiverAccountId) throw new Error('Please select a destination account.')
    const { error } = await trace.step('supabase.rpc.confirm_shared_settlement_with_balance_updates', () =>
      supabase.rpc('confirm_settlement', {
        p_settlement_id:      settlementId,
        p_receiver_account_id: receiverAccountId ?? null,
        p_amount: amount ?? null,
      })
    )
    if (error) throw new Error(error.message)
  } finally {
    trace.end()
  }
}

export async function rejectSettlement(settlementId: string): Promise<void> {
  const trace = createActionTrace('service.shared_settlement.reject')
  const supabase = createClient()
  try {
    const { error } = await trace.step('supabase.rpc.reject_settlement', () =>
      supabase.rpc('reject_settlement', {
        p_settlement_id: settlementId,
      })
    )
    if (error) throw new Error(error.message)
  } finally {
    trace.end()
  }
}

export async function recallSettlement(settlementId: string): Promise<void> {
  const trace = createActionTrace('service.shared_settlement.recall')
  const supabase = createClient()
  try {
    const { error } = await trace.step('supabase.rpc.recall_settlement', () =>
      supabase.rpc('recall_settlement', {
        p_settlement_id: settlementId,
      })
    )
    if (error) throw new Error(error.message)
  } finally {
    trace.end()
  }
}

export async function undoConfirmSettlement(settlementId: string): Promise<void> {
  const trace = createActionTrace('service.shared_settlement.undo_confirm')
  const supabase = createClient()
  try {
    const { error } = await trace.step('supabase.rpc.undo_confirm_settlement', () =>
      supabase.rpc('undo_confirm_settlement', {
        p_settlement_id: settlementId,
      })
    )
    if (error) throw new Error(error.message)
  } finally {
    trace.end()
  }
}
