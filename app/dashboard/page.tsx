import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './DashboardClient'
import { QUERY_LIMITS } from '@/lib/queryLimits'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // The proxy already redirected unauthenticated users to /login.
  // This is a belt-and-suspenders guard in case the proxy is bypassed.
  if (!user) redirect('/login')

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

  const incomeStart = new Date(year, month - 1, 1).toISOString()
  const incomeEnd   = new Date(year, month, 0, 23, 59, 59).toISOString()

  const [{ data: expenses }, { data: budgets }, { data: incomeEntries }] = await Promise.all([
    supabase
      .from('expenses')
      .select('id, user_id, amount, category, note, account_id, is_shared_budget_expense, original_amount, original_currency, converted_amount, created_at')
      .eq('user_id', user.id)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false })
      .limit(QUERY_LIMITS.expenses),
    supabase
      .from('budgets')
      .select('id, user_id, category, item, amount, month, year, created_at')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year),
    supabase
      .from('income_entries')
      .select('id, user_id, income_source_id, account_id, amount, note, status, received_at, created_at')
      .eq('user_id', user.id)
      .gte('received_at', incomeStart)
      .lte('received_at', incomeEnd)
      .limit(QUERY_LIMITS.income),
  ])

  return (
    <DashboardClient
      initialExpenses={expenses ?? []}
      initialBudgets={budgets ?? []}
      initialIncomeEntries={incomeEntries ?? []}
      userEmail={user.email ?? ''}
      month={month}
      year={year}
    />
  )
}
