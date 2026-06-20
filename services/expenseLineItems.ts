import { createClient } from '@/lib/supabase/client'
import {
  Expense, ExpenseLineItem, ExpenseLineItemFormData, ExpenseParticipant,
  PersonalObligation, LineItemAllocation, ExpenseParticipantFormData,
  PersonRef, LineItemDerivedStatus,
} from '@/types'
import { createObligationForContact } from './expenses'

const EXPENSE_LINE_ITEM_SELECT = `
  id,
  expense_id,
  user_id,
  description,
  category,
  original_amount,
  original_currency,
  converted_amount,
  base_currency,
  exchange_rate_used,
  assigned_type,
  assigned_contact_id,
  owner_kind,
  owner_contact_id,
  owner_name,
  owner_email,
  payer_kind,
  payer_contact_id,
  payer_name,
  payer_email,
  shouldered_by_kind,
  shouldered_by_contact_id,
  shouldered_by_name,
  shouldered_by_email,
  derived_status,
  obligation_id,
  notes,
  created_at,
  updated_at
`

const LINE_ITEM_PARTICIPANT_SELECT = `
  id,
  expense_id,
  user_id,
  participant_kind,
  contact_id,
  contact_user_id,
  participant_name,
  participant_email,
  participant_phone,
  share_amount,
  is_payer,
  obligation_id,
  line_item_id,
  created_at
`

const LINE_ITEM_OBLIGATION_SELECT = `
  id,
  user_id,
  direction,
  contact_id,
  relationship_id,
  counterparty_obligation_id,
  created_by_user_id,
  contact_user_id,
  contact_name,
  contact_email,
  amount,
  remaining_amount,
  category,
  note,
  source_expense_id,
  source_line_item_id,
  status,
  created_at,
  settled_at
`

type ParentExpense = Pick<Expense, 'id' | 'amount' | 'original_amount' | 'original_currency' | 'exchange_rate_used'>

function nativeAmountOf(expense: ParentExpense): number {
  return expense.original_amount ?? expense.amount
}

/** Converts a native-currency amount to PHP using the parent's already-established rate. Never recalculates it. */
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

const SELF: PersonRef = { kind: 'self' }

function personKey(ref: PersonRef | undefined): string {
  const r = ref ?? SELF
  if (r.kind === 'self') return 'self'
  if (r.kind === 'contact') return `contact:${r.contact_id ?? ''}`
  return `external:${(r.name ?? '').trim().toLowerCase()}`
}

/**
 * Mirrors compute_line_item_derived_status() in migration_063 exactly.
 * Kept in sync deliberately — this decides whether/how to create an
 * obligation; the SQL trigger independently persists the same result
 * to derived_status regardless of which code path wrote the row.
 */
export function deriveLineItemStatus(owner: PersonRef | undefined, payer: PersonRef | undefined, shoulderedBy: PersonRef | undefined): LineItemDerivedStatus {
  const ownerKey = personKey(owner)
  const payerKey = personKey(payer)
  const shoulderedKey = personKey(shoulderedBy)

  if (payerKey === shoulderedKey) {
    return ownerKey === payerKey ? 'personal' : 'gift'
  }
  if (ownerKey === payerKey) {
    if (ownerKey === 'self') return 'payable'
    if (shoulderedKey === 'self') return 'receivable'
    return 'shared'
  }
  return 'shared'
}

function personRefToColumns(prefix: 'owner' | 'payer' | 'shouldered_by', ref: PersonRef | undefined) {
  const r = ref ?? SELF
  return {
    [`${prefix}_kind`]: r.kind,
    [`${prefix}_contact_id`]: r.kind === 'contact' ? r.contact_id ?? null : null,
    [`${prefix}_name`]: r.kind === 'self' ? null : r.name ?? null,
    [`${prefix}_email`]: r.kind === 'self' ? null : r.email ?? null,
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
    .select(EXPENSE_LINE_ITEM_SELECT)
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: true })
  if (error) throw error

  const itemIds = (items ?? []).map((i) => i.id)
  const participantsByItem = new Map<string, ExpenseParticipant[]>()
  const obligationsByItem = new Map<string, PersonalObligation>()

  if (itemIds.length > 0) {
    const [participantsRes, obligationsRes] = await Promise.all([
      supabase.from('expense_participants').select(LINE_ITEM_PARTICIPANT_SELECT).in('line_item_id', itemIds),
      supabase.from('personal_obligations').select(LINE_ITEM_OBLIGATION_SELECT).in('source_line_item_id', itemIds),
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
    // here using the parent's already-established rate.
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

/** Creates the obligation implied by a receivable/payable status, if any. Returns the new obligation id, or null. */
async function createOwnershipObligation(params: {
  expense: ParentExpense
  lineItemId: string
  lineItemAmountPhp: number
  category: string
  description: string
  status: LineItemDerivedStatus
  owner: PersonRef
  shoulderedBy: PersonRef
}): Promise<string | null> {
  if (params.status === 'payable') {
    // self owes shouldered_by
    return (await createObligationForContact({
      direction: 'user_owes',
      contactId: params.shoulderedBy.kind === 'contact' ? params.shoulderedBy.contact_id ?? null : null,
      contactName: params.shoulderedBy.name ?? '',
      contactEmail: params.shoulderedBy.email ?? null,
      amount: params.lineItemAmountPhp,
      category: params.category,
      note: params.description,
      sourceLineItemId: params.lineItemId,
    })).id
  }
  if (params.status === 'receivable') {
    // owner/payer owes self (shouldered it)
    return (await createObligationForContact({
      direction: 'owed_to_user',
      contactId: params.owner.kind === 'contact' ? params.owner.contact_id ?? null : null,
      contactName: params.owner.name ?? '',
      contactEmail: params.owner.email ?? null,
      amount: params.lineItemAmountPhp,
      category: params.category,
      note: params.description,
      sourceLineItemId: params.lineItemId,
    })).id
  }
  return null
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

  const owner = formData.owner ?? SELF
  const payer = formData.payer ?? SELF
  const shoulderedBy = formData.shouldered_by ?? SELF

  if (!formData.is_shared_split) {
    if (owner.kind !== 'self' && !owner.name?.trim()) throw new Error('Owner is required.')
    if (payer.kind !== 'self' && !payer.name?.trim()) throw new Error('Payer is required.')
    if (shoulderedBy.kind !== 'self' && !shoulderedBy.name?.trim()) throw new Error('Shouldered By is required.')
  }

  const { data: item, error } = await supabase
    .from('expense_line_items')
    .insert({
      expense_id: expense.id,
      user_id: user.id,
      description: formData.description.trim(),
      category: formData.category ?? null,
      original_amount: formData.original_amount,
      notes: formData.notes?.trim() ?? '',
      ...(formData.is_shared_split
        ? {} // leave owner/payer/shouldered_by at self/self/self defaults; participants drive the real split
        : {
          ...personRefToColumns('owner', owner),
          ...personRefToColumns('payer', payer),
          ...personRefToColumns('shouldered_by', shoulderedBy),
        }),
    })
    .select(EXPENSE_LINE_ITEM_SELECT)
    .single()
  if (error) throw error

  if (!formData.is_shared_split) {
    const status = deriveLineItemStatus(owner, payer, shoulderedBy)
    const obligationId = await createOwnershipObligation({
      expense, lineItemId: item.id, lineItemAmountPhp: item.converted_amount,
      category: formData.category || 'Others', description: formData.description,
      status, owner, shoulderedBy,
    })
    if (obligationId) {
      const { error: linkErr } = await supabase
        .from('expense_line_items')
        .update({ obligation_id: obligationId })
        .eq('id', item.id)
      if (linkErr) throw linkErr
      item.obligation_id = obligationId
    }
  }

  if (formData.is_shared_split && (formData.participants?.length ?? 0) > 0) {
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

  const owner = formData.owner ?? SELF
  const payer = formData.payer ?? SELF
  const shoulderedBy = formData.shouldered_by ?? SELF

  if (!formData.is_shared_split) {
    if (owner.kind !== 'self' && !owner.name?.trim()) throw new Error('Owner is required.')
    if (payer.kind !== 'self' && !payer.name?.trim()) throw new Error('Payer is required.')
    if (shoulderedBy.kind !== 'self' && !shoulderedBy.name?.trim()) throw new Error('Shouldered By is required.')
  }

  const { data: updated, error } = await supabase
    .from('expense_line_items')
    .update({
      description: formData.description.trim(),
      category: formData.category ?? null,
      original_amount: formData.original_amount,
      notes: formData.notes?.trim() ?? '',
      ...(formData.is_shared_split
        ? { owner_kind: 'self', owner_contact_id: null, owner_name: null, owner_email: null,
            payer_kind: 'self', payer_contact_id: null, payer_name: null, payer_email: null,
            shouldered_by_kind: 'self', shouldered_by_contact_id: null, shouldered_by_name: null, shouldered_by_email: null }
        : {
          ...personRefToColumns('owner', owner),
          ...personRefToColumns('payer', payer),
          ...personRefToColumns('shouldered_by', shoulderedBy),
        }),
    })
    .eq('id', lineItem.id)
    .select(EXPENSE_LINE_ITEM_SELECT)
    .single()
  if (error) throw error

  if (!formData.is_shared_split) {
    const status = deriveLineItemStatus(owner, payer, shoulderedBy)
    const obligationId = await createOwnershipObligation({
      expense, lineItemId: updated.id, lineItemAmountPhp: updated.converted_amount,
      category: formData.category || 'Others', description: formData.description,
      status, owner, shoulderedBy,
    })
    if (obligationId) {
      const { error: linkErr } = await supabase
        .from('expense_line_items')
        .update({ obligation_id: obligationId })
        .eq('id', updated.id)
      if (linkErr) throw linkErr
      updated.obligation_id = obligationId
    }
  }

  if (formData.is_shared_split && (formData.participants?.length ?? 0) > 0) {
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
