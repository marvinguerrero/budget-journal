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
import { formatCurrency, getMonthName } from '@/utils/format'
import { Search, X } from 'lucide-react'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: getMonthName(i + 1),
}))

const YEARS = [2024, 2025, 2026].map(String)

export default function ExpensesPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { expenses, isLoading, addExpense, updateExpense, deleteExpense } = useExpenses(month, year)

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch =
        !search ||
        e.note.toLowerCase().includes(search.toLowerCase()) ||
        e.category.toLowerCase().includes(search.toLowerCase())
      const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [expenses, search, categoryFilter])

  const totalFiltered = filtered.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} transactions</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums">{formatCurrency(totalFiltered)}</p>
          <p className="text-xs text-muted-foreground">total</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={String(month)} onValueChange={(v: string | null) => v && setMonth(Number(v))}>
          <SelectTrigger className="h-10 rounded-xl w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v: string | null) => v && setYear(Number(v))}>
          <SelectTrigger className="h-10 rounded-xl w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Select value={categoryFilter} onValueChange={(v: string | null) => setCategoryFilter(v || 'all')}>
          <SelectTrigger className="h-10 rounded-xl w-36">
            <SelectValue placeholder="Category" />
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
      </div>

      {isLoading ? (
        <ExpenseListSkeleton />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-4xl">💸</p>
          <p className="font-semibold">No expenses found</p>
          <p className="text-sm text-muted-foreground">
            {search || categoryFilter !== 'all'
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
            />
          ))}
        </div>
      )}

      <QuickAddButton onAdd={addExpense} />
    </div>
  )
}
