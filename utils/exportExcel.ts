import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { Expense, FinancialAccount, ExpenseLineItem, PersonRefKind } from '@/types'
import { ACCOUNT_TYPES } from '@/lib/constants'
import { getMonthName } from '@/utils/format'

const STATUS_EXPORT_LABELS: Record<string, string> = {
  personal: 'Personal',
  receivable: 'Receivable',
  payable: 'Payable',
  gift: 'Gift',
  shared: 'Shared',
}

function personExportLabel(kind: PersonRefKind, name: string | null): string {
  if (kind === 'self') return 'Me'
  return name?.trim() || ''
}

interface ExportOptions {
  month?: number
  year?: number
  day?: string
  format?: 'xlsx' | 'csv'
}

function toISODate(dateString?: string | null): string {
  if (!dateString) return ''
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function yesNo(value: boolean): 'Yes' | 'No' {
  return value ? 'Yes' : 'No'
}

function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type
}

function expenseTypeLabel(e: Expense): string {
  if (e.is_shared_budget_expense) return 'Shared Budget'
  const obligations = e.personal_obligations ?? []
  if (obligations.some((o) => o.direction === 'owed_to_user')) return 'Owe Me'
  if (obligations.some((o) => o.direction === 'user_owes')) return 'I Owe'
  return 'Personal'
}

function receiptFileName(path?: string | null): string {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1] ?? ''
}

function splitMethodLabel(shares: number[]): string {
  if (shares.length <= 1) return ''
  const [first, ...rest] = shares
  const allEqual = rest.every((s) => Math.abs(s - first) < 0.01)
  return allEqual ? 'Equal' : 'Custom'
}

interface BudgetLookupRow {
  category: string
  item: string | null
  month: number
  year: number
}

/** Fetches lookup data needed to fully populate group/budget context columns. */
async function fetchExportLookups(expenses: Expense[]) {
  const supabase = createClient()

  const groupIds = Array.from(new Set(expenses.map((e) => e.shared_group_id).filter((id): id is string => !!id)))

  const [groupsRes, budgetsRes] = await Promise.all([
    groupIds.length > 0
      ? supabase.from('shared_groups').select('id, name').in('id', groupIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
    supabase.from('budgets').select('category, item, month, year'),
  ])

  const groupNameById = new Map<string, string>(
    (groupsRes.data ?? []).map((g) => [g.id, g.name])
  )

  const budgetByKey = new Map<string, BudgetLookupRow>(
    ((budgetsRes.data ?? []) as BudgetLookupRow[]).map((b) => [`${b.category}|${b.month}|${b.year}`, b])
  )

  return { groupNameById, budgetByKey }
}

/** Fetches line items for every exported expense, for the "Line Items" sheet. */
async function fetchLineItemsForExport(expenseIds: string[]): Promise<ExpenseLineItem[]> {
  if (expenseIds.length === 0) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expense_line_items')
    .select('*')
    .in('expense_id', expenseIds)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function exportExpensesToExcel(
  expenses: Expense[],
  accounts: FinancialAccount[],
  options: ExportOptions,
) {
  const { month, year, day, format = 'xlsx' } = options

  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const { groupNameById, budgetByKey } = await fetchExportLookups(expenses)
  const lineItems = await fetchLineItemsForExport(expenses.map((e) => e.id))
  const expenseById = new Map(expenses.map((e) => [e.id, e]))

  const rows = expenses.map((e, index) => {
    const date = new Date(e.created_at)
    const account = e.account_id ? accountById.get(e.account_id) ?? null : null
    const isCredit = account?.type === 'credit'

    const obligations = e.personal_obligations ?? []
    const hasReceivable = obligations.some((o) => o.direction === 'owed_to_user')
    const hasPayable = obligations.some((o) => o.direction === 'user_owes')
    const outstandingBalance = obligations.reduce((sum, o) => sum + Number(o.remaining_amount ?? 0), 0)
    const settlementStatus = obligations.length === 0
      ? ''
      : obligations.every((o) => o.status === 'settled')
        ? 'Settled'
        : obligations.some((o) => Number(o.remaining_amount ?? 0) < Number(o.amount ?? 0))
          ? 'Partially Settled'
          : 'Open'

    const participants = e.expense_participants ?? []
    const payer = participants.find((p) => p.is_payer)
    const selfParticipant = participants.find((p) => p.participant_kind === 'self')
    const isShared = e.is_shared_budget_expense || participants.length > 0

    const createdDate = new Date(e.created_at)
    const matchedBudget = e.is_shared_budget_expense
      ? null
      : budgetByKey.get(`${e.category}|${createdDate.getMonth() + 1}|${createdDate.getFullYear()}`) ?? null

    return {
      // ── row number (must stay first; reflects final filtered/sorted export order) ──
      'No.': index + 1,

      // ── existing columns (unchanged) ──────────────────────────
      Date: date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
      Category: e.category,
      Item: e.shared_budget_item ?? '',
      Note: e.note || '',
      Source: e.is_shared_budget_expense ? 'Shared Budget' : 'Personal',
      Amount: e.amount,

      // ── general information ───────────────────────────────────
      'Expense ID': e.id,
      'Transaction Date': toISODate(e.created_at),
      'Created Date': toISODate(e.created_at),
      'Last Updated Date': toISODate(e.updated_at),

      // ── expense details ────────────────────────────────────────
      'Expense Type': expenseTypeLabel(e),
      'Description / Item': e.shared_budget_item || e.note || '',
      Notes: e.note || '',
      Currency: 'PHP',

      // ── foreign currency ─────────────────────────────────────────
      'Original Amount': e.original_amount ?? '',
      'Original Currency': e.original_currency ?? '',
      'Converted Amount': e.original_currency ? e.amount : '',
      'Base Currency': e.original_currency ? 'PHP' : '',
      'Exchange Rate Used': e.exchange_rate_used ?? '',

      // ── payment information ────────────────────────────────────
      'Source Account': account?.name ?? '',
      'Source Account Type': account ? accountTypeLabel(account.type) : '',
      'Payment Method': '',
      'Is Credit Card': yesNo(isCredit),
      'Credit Card Name': isCredit ? account?.name ?? '' : '',

      // ── credit card information ────────────────────────────────
      'Billing Cycle Start': toISODate(e.credit_billing_cycle_start),
      'Billing Cycle End': toISODate(e.credit_billing_cycle_end),
      'Statement Date': toISODate(e.credit_statement_date),
      'Due Date': toISODate(e.credit_due_date),

      // ── receipt information ─────────────────────────────────────
      'Has Receipt': yesNo(!!e.has_receipt),
      'Receipt File Name': e.has_receipt ? receiptFileName(e.receipt_path) : '',

      // ── shared expense information ──────────────────────────────
      'Is Shared Expense': yesNo(isShared),
      'Number of Participants': participants.length || '',
      'Paid By': payer?.participant_name ?? '',
      'Split Method': splitMethodLabel(participants.map((p) => p.share_amount)),
      'User Share': selfParticipant ? selfParticipant.share_amount : '',
      'Total Shared Amount': participants.length > 0 ? e.amount : '',

      // ── participants ─────────────────────────────────────────────
      Participants: participants.map((p) => p.participant_name).join(', '),

      // ── obligation information ────────────────────────────────────
      'Generated Receivable': yesNo(hasReceivable),
      'Generated Payable': yesNo(hasPayable),
      'Outstanding Balance': obligations.length > 0 ? outstandingBalance : '',
      'Settlement Status': settlementStatus,

      // ── budget information ──────────────────────────────────────
      'Budget Name': matchedBudget ? (matchedBudget.item || matchedBudget.category) : '',
      'Shared Budget Name': e.shared_group_id ? groupNameById.get(e.shared_group_id) ?? '' : '',
      'Budget Item': e.shared_budget_item || matchedBudget?.item || '',

      // ── location (future ready) ──────────────────────────────────
      Merchant: '',
      Store: '',
      City: '',

      // ── tags (future ready) ───────────────────────────────────────
      Tags: '',
    }
  })

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const blankRow = Object.fromEntries(Object.keys(rows[0] ?? {}).map((key) => [key, '']))
  rows.push({ ...blankRow, Note: 'TOTAL', Amount: total } as typeof rows[number])

  const ws = XLSX.utils.json_to_sheet(rows)

  ws['!cols'] = Object.keys(rows[0] ?? {}).map((key) =>
    key === 'No.' ? { wch: 6 } :
    ['Note', 'Notes', 'Description / Item', 'Participants'].includes(key) ? { wch: 28 } : { wch: 16 }
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses')

  if (lineItems.length > 0) {
    const lineItemRows = lineItems.map((li, index) => {
      const parent = expenseById.get(li.expense_id)
      return {
        'No.': index + 1,
        'Parent Expense ID': li.expense_id,
        'Parent Description': parent?.note || parent?.category || '',
        'Item Name': li.description,
        Category: li.category ?? '',
        'Original Amount': li.original_amount,
        'Original Currency': li.original_currency,
        'Converted Amount': li.converted_amount,
        'Base Currency': li.base_currency,
        'Exchange Rate Used': li.exchange_rate_used,
        Owner: personExportLabel(li.owner_kind, li.owner_name),
        Payer: personExportLabel(li.payer_kind, li.payer_name),
        'Shouldered By': personExportLabel(li.shouldered_by_kind, li.shouldered_by_name),
        'Derived Status': STATUS_EXPORT_LABELS[li.derived_status] ?? li.derived_status,
        Notes: li.notes,
      }
    })

    const lineItemsWs = XLSX.utils.json_to_sheet(lineItemRows)
    lineItemsWs['!cols'] = Object.keys(lineItemRows[0] ?? {}).map((key) =>
      key === 'No.' ? { wch: 6 } :
      ['Parent Expense ID', 'Parent Description', 'Item Name', 'Notes'].includes(key) ? { wch: 26 } : { wch: 16 }
    )
    XLSX.utils.book_append_sheet(wb, lineItemsWs, 'Line Items')
  }

  const monthPart = month ? getMonthName(month) : 'All-Months'
  const yearPart = year ? String(year) : 'All-Years'
  const dayPart = day && day !== 'all' ? `-day${day}` : ''
  const extension = format === 'csv' ? 'csv' : 'xlsx'
  const filename = `expenses-${monthPart}-${yearPart}${dayPart}.${extension}`

  XLSX.writeFile(wb, filename, format === 'csv' ? { bookType: 'csv' } : undefined)
}
