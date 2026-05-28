'use client'

import { useState, useMemo } from 'react'
import { useExpenses } from '@/hooks/useExpenses'
import { ExpenseItem } from '@/components/expenses/ExpenseItem'
import { QuickAddButton } from '@/components/expenses/QuickAddButton'
import { ExpenseListSkeleton } from '@/components/common/LoadingSkeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEFAULT_CATEGORIES, isLiabilityType } from '@/lib/constants'
import { formatCurrency, getMonthName, getDaysInMonth } from '@/utils/format'
import { exportExpensesToExcel } from '@/utils/exportExcel'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { cn } from '@/lib/utils'
import { Search, X, Download } from 'lucide-react'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: getMonthName(i + 1),
}))

const YEARS = [2024, 2025, 2026].map(String)

export default function ExpensesPage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [day, setDay] = useState('all')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'asset' | 'liability'>('all')
  const [accountFilter, setAccountFilter] = useState('all')

  const targetMonth = month !== 'all' ? Number(month) : undefined
  const targetYear = year !== 'all' ? Number(year) : undefined

  const { expenses, isLoading, addExpense, updateExpense, deleteExpense } = useExpenses(targetMonth, targetYear)
  const { accounts } = useFinancialAccounts()
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const visibleAccounts = useMemo(() =>
    accountTypeFilter === 'all'
      ? accounts
      : accounts.filter((a) => accountTypeFilter === 'liability' ? isLiabilityType(a.type) : !isLiabilityType(a.type)),
    [accounts, accountTypeFilter]
  )

  const daysInMonth = month !== 'all' && year !== 'all'
    ? getDaysInMonth(Number(month), Number(year))
    : 31

  const handleMonthChange = (v: string | null) => {
    if (!v) return
    setMonth(v)
    setDay('all')
    setAccountFilter('all')
    setAccountTypeFilter('all')
  }

  const handleYearChange = (v: string | null) => {
    if (!v) return
    setYear(v)
    setDay('all')
    setAccountFilter('all')
    setAccountTypeFilter('all')
  }

  const handleAccountTypeFilter = (t: 'all' | 'asset' | 'liability') => {
    setAccountTypeFilter(t)
    setAccountFilter('all')
  }

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const matchesDay =
        day === 'all' || new Date(e.created_at).getDate() === Number(day)
      const matchesSearch =
        !search ||
        e.note.toLowerCase().includes(search.toLowerCase()) ||
        e.category.toLowerCase().includes(search.toLowerCase())
      const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter
      const matchesAccount = accountFilter === 'all' || (e.account_id ?? '') === accountFilter
      const expAccount = e.account_id ? accountMap.get(e.account_id) : null
      const matchesType = accountTypeFilter === 'all'
        || (accountTypeFilter === 'liability' ? (!!expAccount && isLiabilityType(expAccount.type)) : (!!expAccount && !isLiabilityType(expAccount.type)))
      return matchesDay && matchesSearch && matchesCategory && matchesAccount && matchesType
    })
  }, [expenses, day, search, categoryFilter, accountFilter, accountTypeFilter, accountMap])

  const totalFiltered = filtered.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums">{formatCurrency(totalFiltered)}</p>
            <p className="text-xs text-muted-foreground">total</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-xl gap-1.5 text-xs"
            disabled={filtered.length === 0}
            onClick={() => exportExpensesToExcel(filtered, { month: targetMonth, year: targetYear, day })}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={month} onValueChange={handleMonthChange}>
          <SelectTrigger className="h-10 rounded-xl flex-1 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={handleYearChange}>
          <SelectTrigger className="h-10 rounded-xl w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {YEARS.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={day} onValueChange={(v: string | null) => setDay(v || 'all')}>
          <SelectTrigger className="h-10 rounded-xl w-24">
            <SelectValue placeholder="All days" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All days</SelectItem>
            {Array.from({ length: daysInMonth }, (_, i) => String(i + 1)).map((d) => (
              <SelectItem key={d} value={d}>Day {d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search expenses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 rounded-xl"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category + Account */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select value={categoryFilter} onValueChange={(v: string | null) => setCategoryFilter(v || 'all')}>
            <SelectTrigger className="h-10 rounded-xl flex-1 min-w-0">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {DEFAULT_CATEGORIES.map((cat) => (
                <SelectItem key={cat.name} value={cat.name}>
                  {cat.icon} {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={(v: string | null) => setAccountFilter(v || 'all')}>
            <SelectTrigger className="h-10 rounded-xl flex-1 min-w-0">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {visibleAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.emoji} {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {accounts.length > 0 && (
          <div className="flex gap-2">
            {([
              { key: 'all',       label: 'All types' },
              { key: 'asset',     label: '💰 Assets' },
              { key: 'liability', label: '💳 Liabilities' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleAccountTypeFilter(key)}
                className={cn(
                  'flex-1 h-8 rounded-xl text-xs font-semibold border transition-colors',
                  accountTypeFilter === key
                    ? key === 'liability'
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                      : key === 'asset'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                      : 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-card border-border text-muted-foreground hover:bg-accent'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <ExpenseListSkeleton />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-4xl">💸</p>
          <p className="font-semibold">No expenses found</p>
          <p className="text-sm text-muted-foreground">
            {search || categoryFilter !== 'all' || day !== 'all' || accountFilter !== 'all' || accountTypeFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Add your first expense!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((expense) => (
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

      <QuickAddButton onAdd={addExpense} />
    </div>
  )
}
