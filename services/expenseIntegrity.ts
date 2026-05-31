import { createClient } from '@/lib/supabase/client'
import {
  ExpenseIntegrityIssue,
  getExpenseIntegrityIssues,
} from '@/lib/expenseIntegrity'
import { Expense, FinancialAccount, SharedBudget } from '@/types'

export interface ExpenseIntegrityReport {
  totalExpenses: number
  validExpenses: number
  invalidExpenses: number
  issues: ExpenseIntegrityIssue[]
  scannedAt: string
}

type SharedExpenseRef = { id: string }

export async function runExpenseIntegrityCheck(): Promise<ExpenseIntegrityReport> {
  const supabase = createClient()
  const [
    expensesRes,
    accountsRes,
    sharedBudgetsRes,
    sharedExpensesRes,
  ] = await Promise.all([
    supabase.from('expenses').select('*').order('created_at', { ascending: false }),
    supabase.from('financial_accounts').select('*'),
    supabase.from('shared_budgets').select('id, category, item'),
    supabase.from('shared_expenses').select('id'),
  ])

  if (expensesRes.error) throw expensesRes.error
  if (accountsRes.error) throw accountsRes.error
  if (sharedBudgetsRes.error) throw sharedBudgetsRes.error
  if (sharedExpensesRes.error) throw sharedExpensesRes.error

  const accounts = (accountsRes.data ?? []) as FinancialAccount[]
  const sharedBudgets = (sharedBudgetsRes.data ?? []) as Pick<SharedBudget, 'id' | 'category' | 'item'>[]
  const sharedExpenses = (sharedExpensesRes.data ?? []) as SharedExpenseRef[]
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const sharedBudgetsById = new Map(sharedBudgets.map((budget) => [budget.id, budget]))
  const sharedExpenseIds = new Set(sharedExpenses.map((expense) => expense.id))

  const expenses = (expensesRes.data ?? []) as (Partial<Expense> & Record<string, unknown>)[]
  const issues = expenses.flatMap((expense) =>
    getExpenseIntegrityIssues(expense, {
      accountsById,
      sharedBudgetsById,
      sharedExpenseIds,
    })
  )
  const invalidExpenseIds = new Set(issues.filter((issue) => issue.severity === 'error').map((issue) => issue.expenseId))

  return {
    totalExpenses: expenses.length,
    validExpenses: expenses.length - invalidExpenseIds.size,
    invalidExpenses: invalidExpenseIds.size,
    issues,
    scannedAt: new Date().toISOString(),
  }
}
