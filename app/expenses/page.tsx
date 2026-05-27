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
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { formatCurrency, getMonthName, getDaysInMonth } from '@/utils/format'
import { exportExpensesToExcel } from '@/utils/exportExcel'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
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
  const [paymentFilter, setPaymentFilter] = useState('all')

  const targetMonth = month !== 'all' ? Number(month) : undefined
  const targetYear = year !== 'all' ? Number(year) : undefined

  const { expenses, isLoading, addExpense, updateExpense, deleteExpense } = useExpenses(targetMonth, targetYear)
  const { accounts } = useFinancialAccounts()

  const daysInMonth = month !== 'all' && year !== 'all'
    ? getDaysInMonth(Number(month), Number(year))
    : 31

  // Unique payment methods present in the loaded month's expenses
  const availablePaymentMethods = useMemo(() => {
    const methods = new Set(
      expenses.map((e) => e.payment_method).filter((m): m is string => Boolean(m))
    )
    return Array.from(methods).sort()
  }, [expenses])

  const handleMonthChange = (v: string | null) => {
    if (!v) return
    setMonth(v)
    setDay('all')
    setPaymentFilter('all')
  }

  const handleYearChange = (v: string | null) => {
    if (!v) return
    setYear(v)
    setDay('all')
    setPaymentFilter('all')
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
      const matchesPayment =
        paymentFilter === 'all' || (e.payment_method ?? '') === paymentFilter
      return matchesDay && matchesSearch && matchesCategory && matchesPayment
    })
  }, [expenses, day, search, categoryFilter, paymentFilter])

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

      {/* Category + Payment method */}
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
        <Select value={paymentFilter} onValueChange={(v: string | null) => setPaymentFilter(v || 'all')}>
          <SelectTrigger className="h-10 rounded-xl flex-1 min-w-0">
            <SelectValue placeholder="All methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {availablePaymentMethods.map((method) => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <ExpenseListSkeleton />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-4xl">💸</p>
          <p className="font-semibold">No expenses found</p>
          <p className="text-sm text-muted-foreground">
            {search || categoryFilter !== 'all' || day !== 'all' || paymentFilter !== 'all'
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
