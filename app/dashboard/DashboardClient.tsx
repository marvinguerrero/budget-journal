'use client'

import { useMemo, useEffect } from 'react'
import { Expense, Budget, IncomeEntry, FinancialAccount } from '@/types'
import { ACCOUNT_TYPES } from '@/lib/constants'
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
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { Wallet, TrendingDown, Calendar, Tag, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'

interface DashboardClientProps {
  initialExpenses: Expense[]
  initialBudgets: Budget[]
  initialIncomeEntries: IncomeEntry[]
  userEmail: string
  month: number
  year: number
}

export function DashboardClient({
  initialExpenses,
  initialBudgets,
  initialIncomeEntries,
  userEmail,
  month,
  year,
}: DashboardClientProps) {
  const { setExpenses, setBudgets, expenses, budgets, categories } = useExpenseStore()
  const { addExpense, updateExpense, deleteExpense } = useExpenses(month, year)
  useCategories()
  const { accounts, totalBalance } = useFinancialAccounts()

  useEffect(() => {
    setExpenses(initialExpenses)
    setBudgets(initialBudgets)
  }, [initialExpenses, initialBudgets, setExpenses, setBudgets])

  const totalIncome = useMemo(
    () => initialIncomeEntries.reduce((s, e) => s + e.amount, 0),
    [initialIncomeEntries]
  )

  const accountTypeLabel = (type: FinancialAccount['type']) =>
    ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type

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

      {/* Accounts overview */}
      {accounts.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">💰</span>
              <p className="text-sm font-semibold">My Accounts</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums">{formatCurrency(totalBalance)}</p>
              <p className="text-[10px] text-muted-foreground">total balance</p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-accent/40 border border-border/50"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 bg-accent/60">
                  {acc.emoji}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{acc.name}</p>
                  <p className="text-[10px] text-muted-foreground">{accountTypeLabel(acc.type)}</p>
                  <p className={`text-xs font-bold tabular-nums ${acc.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatCurrency(acc.balance)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <a href="/settings" className="block text-center text-xs text-primary font-medium hover:underline pt-0.5">
            Manage accounts →
          </a>
        </div>
      )}

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

      {/* Cash Flow */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <p className="text-sm font-semibold">Cash Flow — {getMonthName(month)}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Income</p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(totalIncome)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Expenses</p>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              {formatCurrency(stats.totalExpenses)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Net</p>
            <p className={`text-sm font-bold tabular-nums ${totalIncome - stats.totalExpenses >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {totalIncome - stats.totalExpenses >= 0 ? '+' : ''}{formatCurrency(totalIncome - stats.totalExpenses)}
            </p>
          </div>
        </div>
        {(totalIncome > 0 || stats.totalExpenses > 0) && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{'--bar-w': `${Math.min(100, totalIncome > 0 ? 100 : 0)}%`, width: 'var(--bar-w)'} as React.CSSProperties}
                />
              </div>
              <span className="w-16 text-right">Income</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-500"
                  style={{'--bar-w': `${totalIncome > 0 ? Math.min(100, (stats.totalExpenses / totalIncome) * 100) : 100}%`, width: 'var(--bar-w)'} as React.CSSProperties}
                />
              </div>
              <span className="w-16 text-right">Expenses</span>
            </div>
          </div>
        )}
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
                accounts={accounts}
              />
            ))}
          </div>
        )}
      </div>

      <QuickAddButton onAdd={addExpense} />
    </div>
  )
}
