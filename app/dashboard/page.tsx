import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './DashboardClient'

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

  const [{ data: expenses }, { data: budgets }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false }),
    supabase
      .from('budgets')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year),
  ])

  return (
    <DashboardClient
      initialExpenses={expenses ?? []}
      initialBudgets={budgets ?? []}
      userEmail={user.email ?? ''}
      month={month}
      year={year}
    />
  )
}
