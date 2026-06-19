import { createClient } from '@/lib/supabase/client'
import {
  Expense, ExpenseLineItem, ExpenseLineItemFormData, ExpenseParticipant,
  PersonalObligation, LineItemAllocation, ExpenseParticipantFormData,
} from '@/types'
import { createObligationForContact } from './expenses'

type ParentExpense = Pick<Expense, 'id' | 'amount' | 'original_amount' | 'original_currency' | 'exchange_rate_used'>

function nativeAmountOf(expense: ParentExpense): number {
  return expense.original_amount ?? expense.amount
}

/** Converts a native-currency share to PHP using the parent's already-established rate. Never recalculates it. */
function toPhp(expense: ParentExpense, nativeAmount: number): number {
  const rate = expense.exchange_rate_used ?? 1
  return Math.round(nativeAmount * rate * 100) / 100
}

export function computeAllocation(expense: ParentExpense, items: ExpenseLineItem[]): LineItemAllocation {
  const nativeTotal = nativeAmountOf(expense)
  const allocated = items.reduce((s, i) => s + i.original_amount, 0)
  const unallocated = Math.max(0, nativeTotal - allocated)
  return {
    nativeTotal,
    allocated,
    unallocated,
    isFullyAllocated: Math.abs(allocated - nativeTotal) < 0.01,
    percentAllocated: nativeTotal > 0 ? Math.min(100, (allocated / nativeTotal) * 100) : 0,
  }
}

export async function getExpenseLineItems(expenseId: string): Promise<{
  items: ExpenseLineItem[]
  participantsByItem: Map<string, ExpenseParticipant[]>
  obligationsByItem: Map<string, PersonalObligation>
}> {
  const supabase = createClient()
  const { data: items, error } = await supabase
    .from('expense_line_items')
    .select('*')
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: true })
  if (error) throw error

  const itemIds = (items ?? []).map((i) => i.id)
  const participantsByItem = new Map<string, ExpenseParticipant[]>()
  const obligationsByItem = new Map<string, PersonalObligation>()

  if (itemIds.length > 0) {
    const [participantsRes, obligationsRes] = await Promise.all([
      supabase.from('expense_participants').select('*').in('line_item_id', itemIds),
      supabase.from('personal_obligations').select('*').in('source_line_item_id', itemIds),
    ])
    if (participantsRes.error) throw participantsRes.error
    if (obligationsRes.error) throw obligationsRes.error

    for (const p of participantsRes.data ?? []) {
      if (!p.line_item_id) continue
      const arr = participantsByItem.get(p.line_item_id) ?? []
      arr.push(p)
      participantsByItem.set(p.line_item_id, arr)
    }
    for (const o of obligationsRes.data ?? []) {
      if (o.source_line_item_id) obligationsByItem.set(o.source_line_item_id, o)
    }
  }

  return { items: items ?? [], participantsByItem, obligationsByItem }
}

function normalizeParticipant(p: ExpenseParticipantFormData): ExpenseParticipantFormData {
  return {
    ...p,
    contact_id: p.contact_id ?? null,
    contact_user_id: p.contact_user_id ?? null,
    participant_email: p.participant_email ?? null,
  }
}

async function createLineItemParticipants(params: {
  expenseId: string
  lineItemId: string
  userId: string
  category: string
  description: string
  expense: ParentExpense
  participants: ExpenseParticipantFormData[]
}) {
  const supabase = createClient()
  const participants = params.participants.map(normalizeParticipant)
  if (participants.length === 0) return

  const payer = participants.find((p) => p.is_payer)
  if (!payer) throw new Error('Select one participant as payer for this shared item.')
  if (participants.some((p) => p.share_amount < 0)) throw new Error('Shares cannot be negative.')

  const payerIsCurrentUser = payer.participant_kind === 'self'
  const rows = []
  for (const p of participants) {
    let obligationId: string | null = null
    const isCurrentUser = p.participant_kind === 'self'

    // Participant shares are native-currency sub-portions of the line item (not
    // their own stored row with a converted_amount), so we convert them to PHP
    // here using the parent's already-established rate — same formula the DB
    // trigger uses for whole line items, just applied to a fraction of one.
    if (payerIsCurrentUser && !p.is_payer && !isCurrentUser && p.share_amount > 0) {
      const obligation = await createObligationForContact({
        direction: 'owed_to_user',
        contactId: p.contact_id ?? null,
        contactUserId: p.contact_user_id ?? null,
        contactName: p.participant_name,
        contactEmail: p.participant_email ?? null,
        amount: toPhp(params.expense, p.share_amount),
        category: params.category,
        note: params.description,
        sourceLineItemId: params.lineItemId,
      })
      obligationId = obligation.id
    }

    if (!payerIsCurrentUser && isCurrentUser && !p.is_payer && p.share_amount > 0) {
      const obligation = await createObligationForContact({
        direction: 'user_owes',
        contactId: payer.contact_id ?? null,
        contactUserId: payer.contact_user_id ?? null,
        contactName: payer.participant_name,
        contactEmail: payer.participant_email ?? null,
        amount: toPhp(params.expense, p.share_amount),
        category: params.category,
        note: params.description,
        sourceLineItemId: params.lineItemId,
      })
      obligationId = obligation.id
    }

    rows.push({
      expense_id: params.expenseId,
      line_item_id: params.lineItemId,
      user_id: params.userId,
      participant_kind: p.participant_kind,
      contact_id: p.contact_id ?? null,
      contact_user_id: p.contact_user_id ?? null,
      participant_name: p.participant_name,
      participant_email: p.participant_email ?? null,
      ...(p.participant_phone ? { participant_phone: p.participant_phone } : {}),
      share_amount: p.share_amount,
      is_payer: p.is_payer === true,
      obligation_id: obligationId,
    })
  }

  const { error } = await supabase.from('expense_participants').insert(rows)
  if (error) throw error
}

/** Deletes only this line item's own participants/obligations — never touches sibling line items. */
async function clearLineItemAssignment(lineItemId: string) {
  const supabase = createClient()

  const { data: participants } = await supabase
    .from('expense_participants')
    .select('obligation_id')
    .eq('line_item_id', lineItemId)
  const participantObligationIds = (participants ?? [])
    .map((p) => p.obligation_id)
    .filter((id): id is string => !!id)

  const { error: delParticipantsErr } = await supabase
    .from('expense_participants')
    .delete()
    .eq('line_item_id', lineItemId)
  if (delParticipantsErr) throw delParticipantsErr

  const obligationIds = [...participantObligationIds]
  const { data: directObligation } = await supabase
    .from('expense_line_items')
    .select('obligation_id')
    .eq('id', lineItemId)
    .maybeSingle()
  if (directObligation?.obligation_id) obligationIds.push(directObligation.obligation_id)

  if (obligationIds.length > 0) {
    // The existing migration_031 trigger on personal_obligations already blocks
    // this delete if any settlement activity exists — surfaces as a thrown error.
    const { error: delObligationsErr } = await supabase
      .from('personal_obligations')
      .delete()
      .in('id', obligationIds)
    if (delObligationsErr) throw delObligationsErr
  }

  await supabase.from('expense_line_items').update({ obligation_id: null }).eq('id', lineItemId)
}

export async function createExpenseLineItem(
  expense: ParentExpense,
  existingItems: ExpenseLineItem[],
  formData: ExpenseLineItemFormData,
): Promise<ExpenseLineItem> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const nativeTotal = nativeAmountOf(expense)
  const existingTotal = existingItems.reduce((s, i) => s + i.original_amount, 0)
  if (existingTotal + formData.original_amount > nativeTotal + 0.01) {
    throw new Error(
      `Line items would total more than the receipt amount (${(existingTotal + formData.original_amount).toFixed(2)} > ${nativeTotal.toFixed(2)}).`
    )
  }
  if ((formData.assigned_type === 'owe_me' || formData.assigned_type === 'i_owe') && !formData.contact_name?.trim()) {
    throw new Error('Contact is required.')
  }

  // original_currency / exchange_rate_used / converted_amount are computed
  // server-side by trg_compute_and_validate_line_item_allocation — we only
  // submit original_amount and let the trigger derive the rest from the parent.
  const { data: item, error } = await supabase
    .from('expense_line_items')
    .insert({
      expense_id: expense.id,
      user_id: user.id,
      description: formData.description.trim(),
      category: formData.category ?? null,
      original_amount: formData.original_amount,
      assigned_type: formData.assigned_type,
      assigned_contact_id: formData.contact_id ?? null,
      notes: formData.notes?.trim() ?? '',
    })
    .select()
    .single()
  if (error) throw error

  if (formData.assigned_type === 'owe_me' || formData.assigned_type === 'i_owe') {
    const obligation = await createObligationForContact({
      direction: formData.assigned_type === 'owe_me' ? 'owed_to_user' : 'user_owes',
      contactId: formData.contact_id ?? null,
      contactUserId: formData.contact_user_id ?? null,
      contactName: formData.contact_name!,
      contactEmail: formData.contact_email ?? null,
      // Use the line item's own server-computed converted_amount (PHP),
      // not a re-derived value, to avoid any rounding drift between the two.
      amount: item.converted_amount,
      category: formData.category || 'Others',
      note: formData.description,
      sourceLineItemId: item.id,
    })
    const { error: linkErr } = await supabase
      .from('expense_line_items')
      .update({ obligation_id: obligation.id })
      .eq('id', item.id)
    if (linkErr) throw linkErr
    item.obligation_id = obligation.id
  }

  if (formData.assigned_type === 'shared' && (formData.participants?.length ?? 0) > 0) {
    await createLineItemParticipants({
      expenseId: expense.id,
      lineItemId: item.id,
      userId: user.id,
      category: formData.category || 'Others',
      description: formData.description,
      expense,
      participants: formData.participants!,
    })
  }

  return item
}

export async function updateExpenseLineItem(
  lineItem: ExpenseLineItem,
  expense: ParentExpense,
  existingItems: ExpenseLineItem[],
  formData: ExpenseLineItemFormData,
): Promise<ExpenseLineItem> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const nativeTotal = nativeAmountOf(expense)
  const othersTotal = existingItems.filter((i) => i.id !== lineItem.id).reduce((s, i) => s + i.original_amount, 0)
  if (othersTotal + formData.original_amount > nativeTotal + 0.01) {
    throw new Error(
      `Line items would total more than the receipt amount (${(othersTotal + formData.original_amount).toFixed(2)} > ${nativeTotal.toFixed(2)}).`
    )
  }

  // Replace assignment (obligation/participants) fresh — scoped strictly to this
  // line item, never touching siblings. Blocked if the existing assignment
  // already has settlement activity (see clearLineItemAssignment).
  await clearLineItemAssignment(lineItem.id)

  const { data: updated, error } = await supabase
    .from('expense_line_items')
    .update({
      description: formData.description.trim(),
      category: formData.category ?? null,
      original_amount: formData.original_amount,
      assigned_type: formData.assigned_type,
      assigned_contact_id: formData.contact_id ?? null,
      notes: formData.notes?.trim() ?? '',
    })
    .eq('id', lineItem.id)
    .select()
    .single()
  if (error) throw error

  if (formData.assigned_type === 'owe_me' || formData.assigned_type === 'i_owe') {
    if (!formData.contact_name?.trim()) throw new Error('Contact is required.')
    const obligation = await createObligationForContact({
      direction: formData.assigned_type === 'owe_me' ? 'owed_to_user' : 'user_owes',
      contactId: formData.contact_id ?? null,
      contactUserId: formData.contact_user_id ?? null,
      contactName: formData.contact_name,
      contactEmail: formData.contact_email ?? null,
      amount: updated.converted_amount,
      category: formData.category || 'Others',
      note: formData.description,
      sourceLineItemId: updated.id,
    })
    const { error: linkErr } = await supabase
      .from('expense_line_items')
      .update({ obligation_id: obligation.id })
      .eq('id', updated.id)
    if (linkErr) throw linkErr
    updated.obligation_id = obligation.id
  }

  if (formData.assigned_type === 'shared' && (formData.participants?.length ?? 0) > 0) {
    await createLineItemParticipants({
      expenseId: expense.id,
      lineItemId: updated.id,
      userId: user.id,
      category: formData.category || 'Others',
      description: formData.description,
      expense,
      participants: formData.participants!,
    })
  }

  return updated
}

export async function deleteExpenseLineItem(id: string): Promise<void> {
  const supabase = createClient()
  // No manual cleanup needed: expense_participants.line_item_id cascades on
  // delete, and personal_obligations.source_line_item_id is set null (the
  // obligation itself survives, intact but unlinked from the receipt — never
  // silently destroyed). The block_line_item_delete_with_activity trigger
  // rejects the whole delete up front if any settlement activity exists.
  const { error } = await supabase.from('expense_line_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
