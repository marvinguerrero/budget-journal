import { createClient } from '@/lib/supabase/client'
import { Expense, ExpenseFormData } from '@/types'
import { createPersonalObligation, createRegisteredPersonalObligation } from './personalObligations'

const EXPENSE_SELECT = '*, personal_obligations(*)'
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
    ...(formData.amount !== undefined ? { amount: formData.amount } : {}),
    ...(formData.category !== undefined ? { category: formData.category } : {}),
    ...(formData.note !== undefined ? { note: formData.note } : {}),
    ...(formData.account_id !== undefined ? { account_id: formData.account_id || null } : {}),
    ...(formData.created_at !== undefined ? { created_at: formData.created_at } : {}),
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

async function createObligationForContact(payload: {
  direction: 'owed_to_user' | 'user_owes'
  contactId?: string | null
  contactUserId?: string | null
  contactName: string
  contactEmail?: string | null
  amount: number
  category: string
  note: string
  sourceExpenseId?: string | null
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
    .select(EXPENSE_SELECT)
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
    .select(EXPENSE_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return sanitizeExpenseArray('getAllExpenses', data)
}

export async function createExpense(formData: ExpenseFormData): Promise<Expense | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (formData.obligation_type === 'i_owe') {
    if (!formData.contact_name?.trim()) throw new Error('Contact is required')
    await createObligationForContact({
      direction: 'user_owes',
      contactId: formData.contact_id ?? null,
      contactUserId: formData.contact_user_id ?? null,
      contactName: formData.contact_name,
      contactEmail: formData.contact_email ?? null,
      amount: formData.amount,
      category: formData.category,
      note: formData.note,
      createdAt: formData.created_at,
    })
    return null
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      user_id: user.id,
      amount: formData.amount,
      category: formData.category,
      note: formData.note,
      account_id: formData.account_id || null,
      created_at: formData.created_at || new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error

  if (formData.obligation_type === 'owe_me') {
    if (!formData.contact_name?.trim()) throw new Error('Contact is required')
    await createObligationForContact({
      direction: 'owed_to_user',
      contactId: formData.contact_id ?? null,
      contactUserId: formData.contact_user_id ?? null,
      contactName: formData.contact_name,
      contactEmail: formData.contact_email ?? null,
      amount: formData.amount,
      category: formData.category,
      note: formData.note,
      sourceExpenseId: data.id,
      createdAt: formData.created_at,
    })
  }

  return getExpenseById(data.id)
}

export async function updateExpense(id: string, formData: Partial<ExpenseFormData>): Promise<Expense | null> {
  const supabase = createClient()
  const existing = await getExpenseById(id)
  const currentObligation = existing.personal_obligations?.find((o) => o.direction === 'owed_to_user')
  const nextType = formData.obligation_type
    ?? (currentObligation ? 'owe_me' : 'normal')

  if (nextType === 'i_owe') {
    if (!formData.contact_name?.trim()) throw new Error('Contact is required')
    await createObligationForContact({
      direction: 'user_owes',
      contactId: formData.contact_id ?? null,
      contactUserId: formData.contact_user_id ?? null,
      contactName: formData.contact_name,
      contactEmail: formData.contact_email ?? null,
      amount: formData.amount ?? existing.amount,
      category: formData.category ?? existing.category,
      note: formData.note ?? existing.note,
      createdAt: formData.created_at ?? existing.created_at,
    })
    await deleteExpense(id)
    return null
  }

  const { data, error } = await supabase
    .from('expenses')
    .update(toExpenseUpdate(formData))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  if (nextType === 'normal') {
    await supabase.from('personal_obligations').delete().eq('source_expense_id', id)
    return getExpenseById(data.id)
  }

  if (nextType === 'owe_me') {
    const latest = await getExpenseById(data.id)
    const latestObligation = latest.personal_obligations?.find((o) => o.direction === 'owed_to_user')

    if (!formData.contact_name?.trim() && !latestObligation?.contact_name) {
      throw new Error('Contact is required')
    }

    if (latestObligation) {
      const { error: obligationErr } = await supabase
        .from('personal_obligations')
        .update({
          contact_user_id: formData.contact_user_id ?? latestObligation.contact_user_id,
          contact_id: formData.contact_id ?? latestObligation.contact_id ?? null,
          contact_name: formData.contact_name?.trim() || latestObligation.contact_name,
          contact_email: formData.contact_email ?? latestObligation.contact_email,
        })
        .eq('id', latestObligation.id)
      if (obligationErr) throw obligationErr
    } else {
      await createObligationForContact({
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
      })
    }
  }

  return getExpenseById(data.id)
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('delete_expense_safely', {
    p_expense_id: id,
  })
  if (error) throw new Error(error.message)
}
