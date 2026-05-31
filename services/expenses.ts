import { createClient } from '@/lib/supabase/client'
import { Expense, ExpenseDetailsData, ExpenseFormData, ExpenseSharedBudgetDetails, FinancialAccount, PersonalObligation } from '@/types'
import { createPersonalObligation, createRegisteredPersonalObligation } from './personalObligations'
import { deleteReceiptFile, uploadExpenseReceipt } from './receipts'

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

async function setExpenseReceipt(params: {
  expense: Pick<Expense, 'id' | 'user_id' | 'created_at' | 'receipt_path'>
  file: File
}) {
  const supabase = createClient()
  const nextPath = await uploadExpenseReceipt({
    userId: params.expense.user_id,
    expenseId: params.expense.id,
    createdAt: params.expense.created_at,
    file: params.file,
  })

  const { error } = await supabase
    .from('expenses')
    .update({
      receipt_path: nextPath,
      has_receipt: true,
    })
    .eq('id', params.expense.id)

  if (error) {
    await deleteReceiptFile(nextPath)
    throw error
  }

  if (params.expense.receipt_path) {
    await deleteReceiptFile(params.expense.receipt_path)
  }
}

async function clearExpenseReceipt(expense: Pick<Expense, 'id' | 'receipt_path'>) {
  const supabase = createClient()

  if (expense.receipt_path) {
    await deleteReceiptFile(expense.receipt_path)
  }

  const { error } = await supabase
    .from('expenses')
    .update({
      receipt_path: null,
      has_receipt: false,
    })
    .eq('id', expense.id)

  if (error) throw error
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

  const [accountRes, obligationRes, sharedBudget] = await Promise.all([
    expense.account_id
      ? supabase.from('financial_accounts').select('*').eq('id', expense.account_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('personal_obligations')
      .select('*')
      .eq('source_expense_id', id)
      .maybeSingle(),
    getExpenseSharedBudgetDetails(expense),
  ])

  if (accountRes.error) throw accountRes.error
  if (obligationRes.error) throw obligationRes.error

  return {
    expense,
    account: (accountRes.data ?? null) as FinancialAccount | null,
    sharedBudget,
    obligation: (obligationRes.data ?? null) as PersonalObligation | null,
  }
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

  if (formData.receipt_file) {
    await setExpenseReceipt({
      expense: {
        id: data.id,
        user_id: user.id,
        created_at: data.created_at,
        receipt_path: data.receipt_path ?? null,
      },
      file: formData.receipt_file,
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

  const baseUpdate = toExpenseUpdate(formData)
  const data = Object.keys(baseUpdate).length > 0
    ? await supabase
      .from('expenses')
      .update(baseUpdate)
      .eq('id', id)
      .select()
      .single()
      .then(({ data: updated, error }) => {
        if (error) throw error
        return updated
      })
    : existing

  if (nextType === 'normal') {
    await supabase.from('personal_obligations').delete().eq('source_expense_id', id)
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

  const receiptBase = await getExpenseById(data.id)
  if (formData.receipt_file) {
    await setExpenseReceipt({
      expense: receiptBase,
      file: formData.receipt_file,
    })
  } else if (formData.remove_receipt) {
    await clearExpenseReceipt(receiptBase)
  }

  return getExpenseById(data.id)
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = createClient()
  const existing = await getExpenseById(id)
  if (existing.receipt_path || existing.has_receipt) {
    await clearExpenseReceipt(existing)
  }

  const { error } = await supabase.rpc('delete_expense_safely', {
    p_expense_id: id,
  })
  if (error) throw new Error(error.message)
}
