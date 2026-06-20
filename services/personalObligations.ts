import { createClient } from '@/lib/supabase/client'
import { PersonalObligation, PersonalObligationSettlement } from '@/types'
import { createActionTrace } from '@/lib/performance'

export interface PersonalContactOption {
  id: string
  email: string
  name: string
}

export async function searchProfiles(query: string): Promise<PersonalContactOption[]> {
  const supabase = createClient()
  const term = query.trim().toLowerCase()
  if (term.length < 2) return []

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', `%${term}%`)
    .limit(8)

  if (error) throw error

  return (data ?? []).map((p: { id: string; email: string }) => ({
    id: p.id,
    email: p.email,
    name: p.email.split('@')[0],
  }))
}

export async function createPersonalObligation(payload: {
  direction: 'owed_to_user' | 'user_owes'
  contactId?: string | null
  contactUserId?: string | null
  contactName: string
  contactEmail?: string | null
  amount: number
  category: string
  note: string
  sourceExpenseId?: string | null
  sourceLineItemId?: string | null
  createdAt?: string
}): Promise<PersonalObligation> {
  const trace = createActionTrace('service.personal_obligation.create', { direction: payload.direction })
  const supabase = createClient()
  try {
    const { data: { user } } = await trace.step('supabase.auth.get_user', () => supabase.auth.getUser())
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await trace.step('supabase.insert.personal_obligation', () =>
      supabase
        .from('personal_obligations')
        .insert({
          user_id: user.id,
          direction: payload.direction,
          contact_id: payload.contactId ?? null,
          contact_user_id: payload.contactUserId ?? null,
          contact_name: payload.contactName.trim(),
          contact_email: payload.contactEmail ?? null,
          amount: payload.amount,
          remaining_amount: payload.amount,
          category: payload.category,
          note: payload.note,
          source_expense_id: payload.sourceExpenseId ?? null,
          source_line_item_id: payload.sourceLineItemId ?? null,
          created_at: payload.createdAt ?? new Date().toISOString(),
        })
        .select()
        .single()
    )

    if (error) throw error
    return data
  } finally {
    trace.end()
  }
}

export async function createRegisteredPersonalObligation(payload: {
  direction: 'owed_to_user' | 'user_owes'
  contactId: string
  amount: number
  category: string
  note: string
  sourceExpenseId?: string | null
  sourceLineItemId?: string | null
  createdAt?: string
}): Promise<PersonalObligation> {
  const trace = createActionTrace('service.personal_obligation.create_registered', { direction: payload.direction })
  const supabase = createClient()
  try {
    const { data, error } = await trace.step('supabase.rpc.create_registered_personal_obligation', () =>
      supabase.rpc('create_registered_personal_obligation', {
        p_direction: payload.direction,
        p_contact_id: payload.contactId,
        p_amount: payload.amount,
        p_category: payload.category,
        p_note: payload.note,
        p_source_expense_id: payload.sourceExpenseId ?? null,
        p_created_at: payload.createdAt ?? new Date().toISOString(),
      })
    )

    if (error) throw new Error(error.message)

    // The RPC doesn't know about line items (it's shared with the top-level
    // obligation flow) — stamp the link with a follow-up update rather than
    // touching the RPC's signature.
    if (payload.sourceLineItemId && data?.id) {
      const { error: linkErr } = await trace.step('supabase.update.line_item_link', () =>
        supabase
          .from('personal_obligations')
          .update({ source_line_item_id: payload.sourceLineItemId })
          .eq('id', data.id)
      )
      if (linkErr) throw linkErr
      return { ...data, source_line_item_id: payload.sourceLineItemId }
    }

    return data
  } finally {
    trace.end()
  }
}

export async function getPersonalObligations(): Promise<{
  obligations: PersonalObligation[]
  settlements: PersonalObligationSettlement[]
}> {
  const supabase = createClient()
  const [{ data: obligations, error: obligationErr }, { data: settlements, error: settlementErr }] =
    await Promise.all([
      supabase
        .from('personal_obligations')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('personal_obligation_settlements')
        .select('*')
        .order('created_at', { ascending: false }),
    ])

  if (obligationErr) throw obligationErr
  if (settlementErr) throw settlementErr

  return {
    obligations: obligations ?? [],
    settlements: settlements ?? [],
  }
}

export async function applyPersonalObligationPayment(payload: {
  obligationId: string
  amount: number
  accountId?: string | null
  note?: string
}): Promise<PersonalObligationSettlement> {
  const trace = createActionTrace('service.personal_settlement.apply')
  const supabase = createClient()
  try {
    if (!payload.accountId) throw new Error('Please select a source account.')
    const { data, error } = await trace.step('supabase.rpc.apply_personal_obligation_payment_with_balance_updates', () =>
      supabase.rpc('apply_personal_obligation_payment', {
        p_obligation_id: payload.obligationId,
        p_amount: payload.amount,
        p_account_id: payload.accountId ?? null,
        p_note: payload.note ?? '',
      })
    )

    if (error) throw new Error(error.message)
    return data
  } finally {
    trace.end()
  }
}

export async function confirmPersonalObligationPayment(
  settlementId: string,
  amount?: number | null,
  receiverAccountId?: string | null,
): Promise<void> {
  const trace = createActionTrace('service.personal_settlement.confirm')
  const supabase = createClient()
  try {
    if (!receiverAccountId) throw new Error('Please select a destination account.')
    const { error } = await trace.step('supabase.rpc.confirm_personal_obligation_payment_with_balance_updates', () =>
      supabase.rpc('confirm_personal_obligation_payment', {
        p_settlement_id: settlementId,
        p_amount: amount ?? null,
        p_receiver_account_id: receiverAccountId ?? null,
      })
    )
    if (error) {
      if (error.message === 'Please select a source account.') {
        throw new Error('The payer needs to choose a source account before this payment can be confirmed.')
      }
      throw new Error(error.message)
    }
  } finally {
    trace.end()
  }
}

export async function recallPersonalObligationPayment(settlementId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('recall_personal_obligation_payment', {
    p_settlement_id: settlementId,
  })
  if (error) throw new Error(error.message)
}

export async function undoConfirmPersonalObligationPayment(settlementId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('undo_confirm_personal_obligation_payment', {
    p_settlement_id: settlementId,
  })
  if (error) throw new Error(error.message)
}

export async function recordExternalPersonalObligationPayment(payload: {
  obligationId: string
  amount: number
  accountId?: string | null
  note?: string
}): Promise<PersonalObligationSettlement> {
  const trace = createActionTrace('service.personal_settlement.record_external')
  const supabase = createClient()
  try {
    if (!payload.accountId) throw new Error('Please select a source account.')
    const { data, error } = await trace.step('supabase.rpc.record_external_personal_obligation_payment_with_balance_updates', () =>
      supabase.rpc('record_external_personal_obligation_payment', {
        p_obligation_id: payload.obligationId,
        p_amount: payload.amount,
        p_account_id: payload.accountId ?? null,
        p_note: payload.note ?? '',
      })
    )

    if (error) throw new Error(error.message)
    return data
  } finally {
    trace.end()
  }
}
