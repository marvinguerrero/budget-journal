'use client'

import { useMemo, useEffect } from 'react'
import { Expense, Budget } from '@/types'
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency, getMonthName, getDaysInMonth } from '@/utils/format'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { SpendingChart } from '@/components/dashboard/SpendingChart'
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart'
import { ExpenseItem } from '@/components/expenses/ExpenseItem'
import { QuickAddButton } from '@/components/expenses/QuickAddButton'
import { InsightSummary } from '@/components/budgets/InsightSummary'
import { useExpenseStore } from '@/store/useExpenseStore'
import { useExpenses } from '@/hooks/useExpenses'
import { useCategories } from '@/hooks/useCategories'
import { Wallet, TrendingDown, Calendar, Tag } from 'lucide-react'
import { format } from 'date-fns'

interface DashboardClientProps {
  initialExpenses: Expense[]
  initialBudgets: Budget[]
  userEmail: string
  month: number
  year: number
}

export function DashboardClient({
  initialExpenses,
  initialBudgets,
  userEmail,
  month,
  year,
}: DashboardClientProps) {
  const { setExpenses, setBudgets, expenses, budgets, categories } = useExpenseStore()
  const { addExpense, updateExpense, deleteExpense } = useExpenses(month, year)
  useCategories()

  useEffect(() => {
    setExpenses(initialExpenses)
    setBudgets(initialBudgets)
  }, [initialExpenses, initialBudgets, setExpenses, setBudgets])

  const stats = useMemo(() => {
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0)
    const remainingBudget = totalBudget - totalExpenses
    const daysInMonth = getDaysInMonth(month, year)
    const today = new Date().getDate()
    const dailyAverage = today > 0 ? totalExpenses / today : 0

    const categoryTotals = expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount
      return acc
    }, {})

    const topCategory = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A'

    return { totalExpenses, totalBudget, remainingBudget, dailyAverage, topCategory }
  }, [expenses, budgets, month, year])

  const categoryBreakdown = useMemo(() => {
    const totals = expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount
      return acc
    }, {})

    const total = Object.values(totals).reduce((s, v) => s + v, 0)

    return Object.entries(totals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
        icon: CATEGORY_ICONS[category] || '📦',
        color: CATEGORY_COLORS[category] || '#6B7280',
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [expenses])

  const spendingTrend = useMemo(() => {
    const dailyTotals = expenses.reduce<Record<string, number>>((acc, e) => {
      const date = format(new Date(e.created_at), 'MMM d')
      acc[date] = (acc[date] || 0) + e.amount
      return acc
    }, {})

    return Object.entries(dailyTotals)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14)
  }, [expenses])

  const recentExpenses = useMemo(() => expenses.slice(0, 5), [expenses])

  return (
    <div className="space-y-6 p-4 lg:p-6 pb-24 lg:pb-6">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {getMonthName(month)} {year} overview
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard
          title="Monthly Expenses"
          value={formatCurrency(stats.totalExpenses)}
          icon={Wallet}
          accent="#EF4444"
          subtitle={`of ${formatCurrency(stats.totalBudget)} budget`}
        />
        <StatsCard
          title="Remaining Budget"
          value={formatCurrency(Math.abs(stats.remainingBudget))}
          subtitle={stats.remainingBudget < 0 ? 'over budget' : 'left to spend'}
          icon={TrendingDown}
          accent={stats.remainingBudget >= 0 ? '#10B981' : '#EF4444'}
        />
        <StatsCard
          title="Daily Average"
          value={formatCurrency(stats.dailyAverage)}
          icon={Calendar}
          accent="#F97316"
          subtitle="this month"
        />
        <StatsCard
          title="Top Category"
          value={`${CATEGORY_ICONS[stats.topCategory] || '📦'} ${stats.topCategory}`}
          icon={Tag}
          accent="#A855F7"
          subtitle="highest spending"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpendingChart data={spendingTrend} />
        <CategoryPieChart data={categoryBreakdown} />
      </div>

      <InsightSummary budgets={budgets} expenses={expenses} categories={categories} />

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">Recent Transactions</h3>
          <a href="/expenses" className="text-xs text-primary font-medium hover:underline">
            View all
          </a>
        </div>
        {recentExpenses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No expenses yet.</p>
            <p className="text-xs mt-1">Tap the + button to add your first one!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentExpenses.map((expense) => (
              <ExpenseItem
                key={expense.id}
                expense={expense}
                onUpdate={updateExpense}
                onDelete={deleteExpense}
              />
            ))}
          </div>
        )}
      </div>

      <QuickAddButton onAdd={addExpense} />
    </div>
  )
}
