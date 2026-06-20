import { createClient } from '@/lib/supabase/client'
import {
  Expense,
  ExpenseDetailsData,
  ExpenseFormData,
  ExpenseParticipant,
  ExpenseParticipantFormData,
  ExpenseSharedBudgetDetails,
  FinancialAccount,
  PersonalObligation,
  PersonalObligationSettlement,
} from '@/types'
import { createPersonalObligation, createRegisteredPersonalObligation } from './personalObligations'
import { deleteReceiptFile, uploadExpenseReceipt } from './receipts'
import { createActionTrace } from '@/lib/performance'

const EXPENSE_SELECT = '*, personal_obligations(*), expense_participants(*)'
const EXPENSE_LIST_SELECT = `
  id,
  user_id,
  amount,
  category,
  note,
  account_id,
  shared_expense_id,
  shared_group_id,
  shared_budget_id,
  shared_budget_item,
  is_shared_budget_expense,
  credit_billing_cycle_start,
  credit_billing_cycle_end,
  credit_statement_date,
  credit_due_date,
  receipt_path,
  has_receipt,
  original_amount,
  original_currency,
  converted_amount,
  exchange_rate_used,
  created_at,
  updated_at,
  personal_obligations(
    id,
    direction,
    contact_id,
    contact_user_id,
    contact_name,
    contact_email,
    amount,
    remaining_amount,
    source_expense_id,
    status
  ),
  expense_participants(
    id,
    participant_kind,
    contact_id,
    contact_user_id,
    participant_name,
    participant_email,
    participant_phone,
    share_amount,
    is_payer,
    obligation_id,
    line_item_id
  )
`
const EXPENSE_MUTATION_SELECT = `
  id,
  user_id,
  amount,
  category,
  note,
  account_id,
  shared_expense_id,
  shared_group_id,
  shared_budget_id,
  shared_budget_item,
  is_shared_budget_expense,
  credit_billing_cycle_start,
  credit_billing_cycle_end,
  credit_statement_date,
  credit_due_date,
  receipt_path,
  has_receipt,
  original_amount,
  original_currency,
  converted_amount,
  exchange_rate_used,
  created_at,
  updated_at
`
const DEBUG_EXPENSE_PIPELINE = process.env.NODE_ENV !== 'production'

type ExpensePipelineSource =
  | 'getExpenses'
  | 'getAllExpenses'
  | 'getExpenseById'
  | 'createExpense'
  | 'updateExpense'

function getExpenseKeys(expense: unknown) {
  return expense && typeof expense === 'object' ? Object.keys(expense) : []
}

function getExpenseField(expense: unknown, field: string) {
  return expense && typeof expense === 'object'
    ? (expense as Record<string, unknown>)[field]
    : undefined
}

function logMalformedExpense(source: ExpensePipelineSource, expense: unknown, index?: number) {
  if (!DEBUG_EXPENSE_PIPELINE) return

  const keys = getExpenseKeys(expense)

  console.warn('[expenses] malformed expense from service pipeline', {
    source,
    index,
    rawExpense: expense,
    keys,
    expenseId: getExpenseField(expense, 'id') ?? null,
    accountId: getExpenseField(expense, 'account_id') ?? null,
    amount: getExpenseField(expense, 'amount') ?? null,
    createdAt: getExpenseField(expense, 'created_at') ?? null,
    isEmptyObject: Boolean(expense && typeof expense === 'object' && keys.length === 0),
    isNull: expense === null,
    isUndefined: expense === undefined,
    missing: {
      id: !getExpenseField(expense, 'id'),
      account_id: !getExpenseField(expense, 'account_id'),
      amount: getExpenseField(expense, 'amount') === null || getExpenseField(expense, 'amount') === undefined,
      created_at: !getExpenseField(expense, 'created_at'),
    },
  })
}

function isNonEmptyExpenseObject(expense: unknown): expense is Expense {
  return Boolean(
    expense
      && typeof expense === 'object'
      && Object.keys(expense).length > 0
  )
}

function sanitizeExpenseArray(source: ExpensePipelineSource, data: unknown): Expense[] {
  if (!Array.isArray(data)) {
    if (DEBUG_EXPENSE_PIPELINE) {
      console.warn('[expenses] service received non-array expense payload', {
        source,
        type: data === null ? 'null' : typeof data,
        data,
      })
    }
    return []
  }

  return data.filter((expense, index): expense is Expense => {
    const isValidContainer = isNonEmptyExpenseObject(expense)
    if (!isValidContainer) {
      logMalformedExpense(source, expense, index)
    }
    return isValidContainer
  })
}

function sanitizeSingleExpense(source: ExpensePipelineSource, data: unknown): Expense {
  if (!isNonEmptyExpenseObject(data)) {
    logMalformedExpense(source, data)
    throw new Error('Malformed expense record returned from database.')
  }

  return data
}

async function getExpenseById(id: string): Promise<Expense> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return sanitizeSingleExpense('getExpenseById', data)
}

function toExpenseUpdate(formData: Partial<ExpenseFormData>) {
  return {
    // original_amount is paired with amount so the currency-conversion trigger always
    // re-derives the native value fresh, instead of falling back to a stale prior value.
    ...(formData.amount !== undefined ? { amount: formData.amount, original_amount: formData.amount } : {}),
    ...(formData.category !== undefined ? { category: formData.category } : {}),
    ...(formData.note !== undefined ? { note: formData.note } : {}),
    ...(formData.account_id !== undefined ? { account_id: formData.account_id || null } : {}),
    ...(formData.created_at !== undefined ? { created_at: formData.created_at } : {}),
  }
}

function getLegacyOweMeObligation(expense: Expense) {
  const hasParticipants = (expense.expense_participants?.length ?? 0) > 0
  if (hasParticipants) return undefined
  return expense.personal_obligations?.find((o) => o.direction === 'owed_to_user')
}

function normalizeParticipant(participant: ExpenseParticipantFormData): ExpenseParticipantFormData {
  return {
    participant_kind: participant.participant_kind,
    contact_id: participant.contact_id ?? null,
    contact_user_id: participant.contact_user_id ?? null,
    participant_name: participant.participant_name.trim(),
    participant_email: participant.participant_email?.trim() || null,
    participant_phone: participant.participant_phone?.trim() || null,
    share_amount: Number(participant.share_amount),
    is_payer: participant.is_payer === true,
  }
}

function getValidParticipants(formData: Partial<ExpenseFormData>) {
  return (formData.participants ?? [])
    .map(normalizeParticipant)
    .filter((participant) =>
      participant.participant_name
      && Number.isFinite(participant.share_amount)
      && participant.share_amount >= 0
    )
}

async function replaceExpenseParticipants(params: {
  expenseId: string
  userId: string
  participants: ExpenseParticipantFormData[]
  totalAmount: number
  category: string
  note: string
  createdAt: string
}) {
  const supabase = createClient()

  const participantDelete = await supabase.from('expense_participants').delete().eq('expense_id', params.expenseId)
  if (participantDelete.error) throw participantDelete.error

  const obligationDelete = await supabase.from('personal_obligations').delete().eq('source_expense_id', params.expenseId)
  if (obligationDelete.error) throw obligationDelete.error

  if (params.participants.length === 0) return

  const payer = params.participants.find((participant) => participant.is_payer)
  if (!payer) throw new Error('Select one participant as payer.')
  const participantTotal = params.participants.reduce((sum, participant) => sum + participant.share_amount, 0)
  if (params.participants.some((participant) => participant.share_amount < 0)) {
    throw new Error('Participant shares cannot be negative.')
  }
  if (Math.abs(participantTotal - params.totalAmount) > 0.01) {
    throw new Error('Participant shares must equal the expense amount.')
  }

  const createdRows = []
  const payerIsCurrentUser = payer.participant_kind === 'self'
  for (const participant of params.participants) {
    let obligationId: string | null = null
    const participantIsCurrentUser = participant.participant_kind === 'self'

    if (payerIsCurrentUser && !participant.is_payer && !participantIsCurrentUser && participant.share_amount > 0) {
      const obligation = await createObligationForContact({
        direction: 'owed_to_user',
        contactId: participant.contact_id ?? null,
        contactUserId: participant.contact_user_id ?? null,
        contactName: participant.participant_name,
        contactEmail: participant.participant_email ?? null,
        amount: participant.share_amount,
        category: params.category,
        note: params.note,
        sourceExpenseId: params.expenseId,
        createdAt: params.createdAt,
      })
      obligationId = obligation.id
    }

    if (!payerIsCurrentUser && participantIsCurrentUser && !participant.is_payer && participant.share_amount > 0) {
      const obligation = await createObligationForContact({
        direction: 'user_owes',
        contactId: payer.contact_id ?? null,
        contactUserId: payer.contact_user_id ?? null,
        contactName: payer.participant_name,
        contactEmail: payer.participant_email ?? null,
        amount: participant.share_amount,
        category: params.category,
        note: params.note,
        sourceExpenseId: params.expenseId,
        createdAt: params.createdAt,
      })
      obligationId = obligation.id
    }

    createdRows.push({
      expense_id: params.expenseId,
      user_id: params.userId,
      participant_kind: participant.participant_kind,
      contact_id: participant.contact_id ?? null,
      contact_user_id: participant.contact_user_id ?? null,
      participant_name: participant.participant_name,
      participant_email: participant.participant_email ?? null,
      ...(participant.participant_phone ? { participant_phone: participant.participant_phone } : {}),
      share_amount: participant.share_amount,
      is_payer: participant.is_payer === true,
      obligation_id: obligationId,
    })
  }

  const { error } = await supabase.from('expense_participants').insert(createdRows)
  if (error) throw error
}

async function createIOweParticipantObligations(formData: ExpenseFormData) {
  const participants = getValidParticipants(formData)
  const payer = formData.contact_name?.trim()
    ? {
      contact_id: formData.contact_id ?? null,
      contact_user_id: formData.contact_user_id ?? null,
      participant_name: formData.contact_name.trim(),
      participant_email: formData.contact_email ?? null,
    }
    : participants.find((participant) => participant.is_payer)

  if (!payer?.participant_name) throw new Error('Paid by contact is required')

  const selfParticipant = participants.find((participant) => participant.participant_kind === 'self')
  const amount = selfParticipant?.share_amount ?? formData.amount
  if (amount <= 0) return

  await createObligationForContact({
    direction: 'user_owes',
    contactId: payer.contact_id ?? null,
    contactUserId: payer.contact_user_id ?? null,
    contactName: payer.participant_name,
    contactEmail: payer.participant_email ?? null,
    amount,
    category: formData.category,
    note: formData.note,
    createdAt: formData.created_at,
  })
}

async function setExpenseReceipt(params: {
  expense: Pick<Expense, 'id' | 'user_id' | 'created_at' | 'receipt_path'>
  file: File
}) {
  const trace = createActionTrace('service.expense.set_receipt', { sizeBytes: params.file.size })
  const supabase = createClient()
  try {
    const nextPath = await trace.step('storage.upload.receipt', () => uploadExpenseReceipt({
      userId: params.expense.user_id,
      expenseId: params.expense.id,
      createdAt: params.expense.created_at,
      file: params.file,
    }))

    const { error } = await trace.step('supabase.update.expense_receipt_metadata', () =>
      supabase
        .from('expenses')
        .update({
          receipt_path: nextPath,
          has_receipt: true,
        })
        .eq('id', params.expense.id)
    )

    if (error) {
      await trace.step('storage.rollback_uploaded_receipt', () => deleteReceiptFile(nextPath))
      throw error
    }

    if (params.expense.receipt_path) {
      await trace.step('storage.delete_previous_receipt', () => deleteReceiptFile(params.expense.receipt_path))
    }
  } finally {
    trace.end()
  }
}

async function clearExpenseReceipt(expense: Pick<Expense, 'id' | 'receipt_path'>) {
  const trace = createActionTrace('service.expense.clear_receipt')
  const supabase = createClient()

  try {
    if (expense.receipt_path) {
      await trace.step('storage.delete_receipt', () => deleteReceiptFile(expense.receipt_path))
    }

    const { error } = await trace.step('supabase.update.expense_receipt_metadata', () =>
      supabase
        .from('expenses')
        .update({
          receipt_path: null,
          has_receipt: false,
        })
        .eq('id', expense.id)
    )

    if (error) throw error
  } finally {
    trace.end()
  }
}

async function isConnectedRegisteredContact(contactId?: string | null) {
  if (!contactId) return false

  const supabase = createClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('contact_type, link_status, linked_user_id')
    .eq('id', contactId)
    .maybeSingle()

  if (error) throw error
  return data?.contact_type === 'registered'
    && data.link_status === 'connected'
    && Boolean(data.linked_user_id)
}

export async function createObligationForContact(payload: {
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
}) {
  if (await isConnectedRegisteredContact(payload.contactId)) {
    return createRegisteredPersonalObligation({
      direction: payload.direction,
      contactId: payload.contactId!,
      amount: payload.amount,
      category: payload.category,
      note: payload.note,
      sourceExpenseId: payload.sourceExpenseId ?? null,
      sourceLineItemId: payload.sourceLineItemId ?? null,
      createdAt: payload.createdAt,
    })
  }

  return createPersonalObligation(payload)
}

export async function getExpenses(month?: number, year?: number): Promise<Expense[]> {
  const supabase = createClient()
  const startedAt = DEBUG_EXPENSE_PIPELINE ? performance.now() : 0
  let query = supabase
    .from('expenses')
    .select(EXPENSE_LIST_SELECT)
    .order('created_at', { ascending: false })

  if (month && year) {
    const startDate = new Date(year, month - 1, 1).toISOString()
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()
    query = query.gte('created_at', startDate).lte('created_at', endDate)
  } else if (year) {
    const startDate = new Date(year, 0, 1).toISOString()
    const endDate = new Date(year, 11, 31, 23, 59, 59).toISOString()
    query = query.gte('created_at', startDate).lte('created_at', endDate)
  }

  const { data, error } = await query
  if (error) throw error
  const expenses = sanitizeExpenseArray('getExpenses', data)
  if (DEBUG_EXPENSE_PIPELINE) {
    console.debug('[expenses] service getExpenses:done', {
      month,
      year,
      rawCount: Array.isArray(data) ? data.length : 0,
      count: expenses.length,
      durationMs: Math.round(performance.now() - startedAt),
    })
  }
  return expenses
}

export async function getAllExpenses(): Promise<Expense[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_LIST_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return sanitizeExpenseArray('getAllExpenses', data)
}

async function getExpenseSharedBudgetDetails(expense: Expense): Promise<ExpenseSharedBudgetDetails | null> {
  if (!expense.shared_budget_id) return null

  const supabase = createClient()
  const [budgetRes, spentRes] = await Promise.all([
    supabase
      .from('shared_budgets')
      .select('id, group_id, category, item, amount')
      .eq('id', expense.shared_budget_id)
      .maybeSingle(),
    supabase
      .from('expenses')
      .select('amount')
      .eq('shared_budget_id', expense.shared_budget_id),
  ])

  if (budgetRes.error) throw budgetRes.error
  if (spentRes.error) throw spentRes.error
  if (!budgetRes.data) return null

  const budget = budgetRes.data as {
    group_id: string
    category: string
    item: string
    amount: number
  }
  const groupRes = await supabase
    .from('shared_groups')
    .select('name')
    .eq('id', budget.group_id)
    .maybeSingle()
  if (groupRes.error) throw groupRes.error

  const actualSpent = (spentRes.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const budgetAmount = Number(budget.amount ?? 0)

  return {
    group_name: groupRes.data?.name ?? 'Shared Group',
    category: budget.category,
    item: budget.item,
    budget_amount: budgetAmount,
    actual_spent: actualSpent,
    remaining_budget: budgetAmount - actualSpent,
  }
}

export async function getExpenseDetails(id: string): Promise<ExpenseDetailsData> {
  const supabase = createClient()
  const expense = await getExpenseById(id)

  const [accountRes, obligationsRes, participantsRes, sharedBudget] = await Promise.all([
    expense.account_id
      ? supabase.from('financial_accounts').select('*').eq('id', expense.account_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('personal_obligations')
      .select('*')
      .eq('source_expense_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('expense_participants')
      .select('*, personal_obligations(*)')
      .eq('expense_id', id)
      .is('line_item_id', null)
      .order('created_at', { ascending: true }),
    getExpenseSharedBudgetDetails(expense),
  ])

  if (accountRes.error) throw accountRes.error
  if (obligationsRes.error) throw obligationsRes.error
  if (participantsRes.error) throw participantsRes.error

  const obligations = (obligationsRes.data ?? []) as PersonalObligation[]
  const obligationIds = obligations.map((item) => item.id)
  const settlementsRes = obligationIds.length > 0
    ? await supabase
      .from('personal_obligation_settlements')
      .select('*')
      .in('obligation_id', obligationIds)
      .order('created_at', { ascending: false })
    : { data: [], error: null }

  if (settlementsRes.error) throw settlementsRes.error

  return {
    expense,
    account: (accountRes.data ?? null) as FinancialAccount | null,
    sharedBudget,
    obligation: obligations[0] ?? null,
    obligations,
    settlements: (settlementsRes.data ?? []) as PersonalObligationSettlement[],
    participants: (participantsRes.data ?? []) as ExpenseParticipant[],
  }
}

export async function createExpense(formData: ExpenseFormData): Promise<Expense | null> {
  const trace = createActionTrace('service.expense.create', {
    hasReceipt: Boolean(formData.receipt_file),
    obligationType: formData.obligation_type ?? 'normal',
  })
  const supabase = createClient()
  try {
    const { data: { user } } = await trace.step('supabase.auth.get_user', () => supabase.auth.getUser())
    if (!user) throw new Error('Not authenticated')

    if (formData.obligation_type === 'i_owe') {
      await trace.step('service.create_i_owe_obligation', () => createIOweParticipantObligations(formData))
      return null
    }

    const { data, error } = await trace.step('supabase.insert.expense_with_balance_trigger', () =>
      supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          amount: formData.amount,
          // Paired with amount: the currency-conversion trigger treats this as the
          // native amount entered. For base-currency accounts it's a no-op (cleared
          // back to null); for foreign accounts, `data.amount` comes back as PHP.
          original_amount: formData.amount,
          category: formData.category,
          note: formData.note,
          account_id: formData.account_id || null,
          created_at: formData.created_at || new Date().toISOString(),
        })
        .select(EXPENSE_MUTATION_SELECT)
        .single()
    )

    if (error) throw error

    // Use data.amount (post-trigger, guaranteed PHP) rather than formData.amount
    // (which is the native foreign-currency value for foreign-account expenses) —
    // personal obligations and splits are always PHP-denominated.
    if (formData.obligation_type === 'owe_me') {
      if (!formData.contact_name?.trim()) throw new Error('Contact is required')
      await trace.step('service.create_obligation', () => createObligationForContact({
        direction: 'owed_to_user',
        contactId: formData.contact_id ?? null,
        contactUserId: formData.contact_user_id ?? null,
        contactName: formData.contact_name!,
        contactEmail: formData.contact_email ?? null,
        amount: data.amount,
        category: formData.category,
        note: formData.note,
        sourceExpenseId: data.id,
        createdAt: formData.created_at,
      }))
    }

    if ((formData.obligation_type ?? 'normal') === 'normal') {
      const participants = getValidParticipants(formData)
      if (participants.length > 0) {
        await trace.step('service.replace_expense_participants', () => replaceExpenseParticipants({
          expenseId: data.id,
          userId: user.id,
          participants,
          totalAmount: data.amount,
          category: formData.category,
          note: formData.note,
          createdAt: data.created_at,
        }))
      }
    }

    if (formData.receipt_file) {
      await trace.step('service.set_receipt', () => setExpenseReceipt({
        expense: {
          id: data.id,
          user_id: user.id,
          created_at: data.created_at,
          receipt_path: data.receipt_path ?? null,
        },
        file: formData.receipt_file!,
      }))
    }

    return trace.step('supabase.select.created_expense_details', () => getExpenseById(data.id))
  } finally {
    trace.end()
  }
}

export async function updateExpense(id: string, formData: Partial<ExpenseFormData>): Promise<Expense | null> {
  const trace = createActionTrace('service.expense.update', {
    hasReceipt: Boolean(formData.receipt_file),
    removesReceipt: Boolean(formData.remove_receipt),
    obligationType: formData.obligation_type,
  })
  const supabase = createClient()
  try {
    const existing = await trace.step('supabase.select.existing_expense_details', () => getExpenseById(id))
    const currentObligation = getLegacyOweMeObligation(existing)
    const nextType = formData.obligation_type
      ?? (currentObligation ? 'owe_me' : 'normal')

    if (nextType === 'i_owe') {
      await trace.step('service.create_i_owe_obligation', () => createIOweParticipantObligations({
        amount: formData.amount ?? existing.amount,
        category: formData.category ?? existing.category,
        note: formData.note ?? existing.note,
        created_at: formData.created_at ?? existing.created_at,
        obligation_type: 'i_owe',
        contact_id: formData.contact_id ?? null,
        contact_user_id: formData.contact_user_id ?? null,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email ?? null,
        participants: formData.participants,
      }))
      await trace.step('service.delete_original_expense', () => deleteExpense(id))
      return null
    }

    const baseUpdate = toExpenseUpdate(formData)
    const data = Object.keys(baseUpdate).length > 0
      ? await trace.step('supabase.update.expense_with_balance_trigger', () =>
        supabase
          .from('expenses')
          .update(baseUpdate)
          .eq('id', id)
          .select(EXPENSE_MUTATION_SELECT)
          .single()
          .then(({ data: updated, error }) => {
            if (error) throw error
            return updated
          })
      )
      : existing

    if (nextType === 'normal' && (formData.participants !== undefined || formData.obligation_type !== undefined)) {
      const participants = getValidParticipants(formData)
      await trace.step('service.replace_expense_participants', () => replaceExpenseParticipants({
        expenseId: id,
        userId: data.user_id,
        participants,
        // data.amount is authoritative post-write (PHP-converted for foreign accounts);
        // formData.amount would be the native foreign-currency value, which is wrong here.
        totalAmount: data.amount ?? formData.amount,
        category: formData.category ?? data.category,
        note: formData.note ?? data.note,
        createdAt: formData.created_at ?? data.created_at,
      }))
    }

    if (nextType === 'owe_me') {
      const latest = await trace.step('supabase.select.latest_expense_obligation', () => getExpenseById(data.id))
      const latestObligation = latest.personal_obligations?.find((o) => o.direction === 'owed_to_user')

      if (!formData.contact_name?.trim() && !latestObligation?.contact_name) {
        throw new Error('Contact is required')
      }

      if (latestObligation) {
        const { error: obligationErr } = await trace.step('supabase.update.personal_obligation', () =>
          supabase
            .from('personal_obligations')
            .update({
              contact_user_id: formData.contact_user_id ?? latestObligation.contact_user_id,
              contact_id: formData.contact_id ?? latestObligation.contact_id ?? null,
              contact_name: formData.contact_name?.trim() || latestObligation.contact_name,
              contact_email: formData.contact_email ?? latestObligation.contact_email,
            })
            .eq('id', latestObligation.id)
        )
        if (obligationErr) throw obligationErr
      } else {
        await trace.step('service.create_obligation', () => createObligationForContact({
          direction: 'owed_to_user',
          contactId: formData.contact_id ?? null,
          contactUserId: formData.contact_user_id ?? null,
          contactName: formData.contact_name ?? '',
          contactEmail: formData.contact_email ?? null,
          amount: formData.amount ?? data.amount,
          category: formData.category ?? data.category,
          note: formData.note ?? data.note,
          sourceExpenseId: id,
          createdAt: formData.created_at ?? data.created_at,
        }))
      }
    }

    if (formData.receipt_file || formData.remove_receipt) {
      const receiptBase = await trace.step('supabase.select.receipt_base_expense', () => getExpenseById(data.id))
      if (formData.receipt_file) {
        await trace.step('service.set_receipt', () => setExpenseReceipt({
          expense: receiptBase,
          file: formData.receipt_file!,
        }))
      } else if (formData.remove_receipt) {
        await trace.step('service.clear_receipt', () => clearExpenseReceipt(receiptBase))
      }
    }

    return trace.step('supabase.select.updated_expense_details', () => getExpenseById(data.id))
  } finally {
    trace.end()
  }
}

export async function deleteExpense(id: string): Promise<void> {
  const trace = createActionTrace('service.expense.delete')
  const supabase = createClient()
  try {
    const existing = await trace.step('supabase.select.existing_expense_details', () => getExpenseById(id))
    if (existing.receipt_path || existing.has_receipt) {
      await trace.step('service.clear_receipt', () => clearExpenseReceipt(existing))
    }

    const { error } = await trace.step('supabase.rpc.delete_expense_safely_with_balance_updates', () =>
      supabase.rpc('delete_expense_safely', {
        p_expense_id: id,
      })
    )
    if (error) throw new Error(error.message)
  } finally {
    trace.end()
  }
}
