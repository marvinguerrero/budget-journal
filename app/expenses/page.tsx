'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useExpenses } from '@/hooks/useExpenses'
import { ExpenseItem } from '@/components/expenses/ExpenseItem'
import { ExpenseDetailsView } from '@/components/expenses/ExpenseDetailsView'
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
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { DEFAULT_CATEGORIES, isLiabilityType } from '@/lib/constants'
import { formatCurrency, getMonthName, getDaysInMonth } from '@/utils/format'
import { exportExpensesToExcel } from '@/utils/exportExcel'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import { getExpenseIntegrityIssues } from '@/lib/expenseIntegrity'
import { Expense } from '@/types'
import { Search, X, Download } from 'lucide-react'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: getMonthName(i + 1),
}))

const YEARS = [2024, 2025, 2026].map(String)
const MAX_RENDERED_EXPENSES = 250

function getExpenseDebugValue(expense: unknown, key: string) {
  if (!expense || typeof expense !== 'object') {
    return undefined
  }

  return (expense as Record<string, unknown>)[key]
}

function getExpenseDebugKeys(expense: unknown) {
  return expense && typeof expense === 'object' ? Object.keys(expense) : []
}

function getMalformedExpenseDebugInfo(expense: unknown, index: number) {
  const keys = getExpenseDebugKeys(expense)

  return {
    index,
    rawExpense: expense,
    keys,
    expenseId: getExpenseDebugValue(expense, 'id') ?? null,
    accountId: getExpenseDebugValue(expense, 'account_id') ?? null,
    amount: getExpenseDebugValue(expense, 'amount') ?? null,
    createdAt: getExpenseDebugValue(expense, 'created_at') ?? null,
    isEmptyObject: Boolean(expense && typeof expense === 'object' && keys.length === 0),
    isNull: expense === null,
    isUndefined: expense === undefined,
    missing: {
      id: !getExpenseDebugValue(expense, 'id'),
      account_id: !getExpenseDebugValue(expense, 'account_id'),
      amount: getExpenseDebugValue(expense, 'amount') === null || getExpenseDebugValue(expense, 'amount') === undefined,
      date: !getExpenseDebugValue(expense, 'created_at'),
    },
  }
}

function isExpenseCandidate(expense: unknown) {
  return Boolean(
    expense
      && typeof expense === 'object'
      && Object.keys(expense).length > 0
      && typeof getExpenseDebugValue(expense, 'id') === 'string'
      && typeof getExpenseDebugValue(expense, 'amount') === 'number'
      && typeof getExpenseDebugValue(expense, 'created_at') === 'string'
  )
}

function getErrorDebugInfo(error: unknown) {
  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      stack: error.stack,
    }
  }

  return {
    errorMessage: String(error),
    stack: undefined,
  }
}

function getValueDebugInfo(value: unknown) {
  return {
    type: value === null ? 'null' : typeof value,
    isArray: Array.isArray(value),
    value,
  }
}

function getExpenseValidationLimit() {
  if (typeof window === 'undefined') {
    return null
  }

  const rawLimit = new URLSearchParams(window.location.search).get('expenseLimit')
    ?? window.localStorage.getItem('expenseValidationLimit')
  if (!rawLimit) {
    return null
  }

  const limit = Number(rawLimit)
  return Number.isInteger(limit) && limit > 0 ? limit : null
}

function shouldSkipExpenseIntegrity() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get('skipExpenseIntegrity') === '1'
}

function isExpenseDebugEnabled() {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return false
  }

  const params = new URLSearchParams(window.location.search)
  return params.get('debugExpenses') === '1'
    || window.localStorage.getItem('debugExpenses') === '1'
}

export default function ExpensesPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [day, setDay] = useState('all')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'asset' | 'liability'>('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'with' | 'without'>('all')
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null)
  const filterSeq = useRef(0)
  const deferredSearch = useDeferredValue(search)
  const debugExpenses = isExpenseDebugEnabled()

  const logFilterChange = useCallback((name: string, value: unknown) => {
    if (!debugExpenses) return

    filterSeq.current += 1
    console.debug('[expenses] filter change', {
      seq: filterSeq.current,
      filter: name,
      value,
    })
  }, [debugExpenses])

  const targetMonth = month !== 'all' ? Number(month) : undefined
  const targetYear = year !== 'all' ? Number(year) : undefined

  const { expenses, isLoading, refetch, addExpense, updateExpense, deleteExpense } = useExpenses(targetMonth, targetYear)
  const { accounts } = useFinancialAccounts()
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const skipExpenseIntegrity = shouldSkipExpenseIntegrity()
  const expenseList = useMemo(() => {
    if (Array.isArray(expenses)) {
      return expenses.filter((expense, index) => {
        const isValidContainer = isExpenseCandidate(expense)

        if (!isValidContainer && debugExpenses) {
          console.warn(
            '[expenses] filtering malformed expense before processing',
            getMalformedExpenseDebugInfo(expense, index)
          )
        }

        return isValidContainer
      })
    }

    if (debugExpenses) {
      console.warn('[expenses] expected expenses array; using empty list', getValueDebugInfo(expenses))
    }
    return []
  }, [expenses, debugExpenses])
  const safeExpenses = useMemo(() => {
    if (!debugExpenses) {
      return expenseList
    }

    const validationLimit = getExpenseValidationLimit()
    const validationList = validationLimit ? expenseList.slice(0, validationLimit) : expenseList

    console.log('Expense Count', expenseList.length)
    console.log('Account Count', accounts.length)
    console.log('[Expense Validation Setup]', {
      sourceCount: expenseList.length,
      validationCount: validationList.length,
      validationLimit,
      skipExpenseIntegrity,
      accountCount: accounts.length,
    })

    if (skipExpenseIntegrity) {
      console.warn('[expenses] integrity checker bypass enabled via skipExpenseIntegrity=1')
      return validationList.filter((expense, index) => {
        if (!expense || typeof expense !== 'object') {
          console.warn('[expenses] skipping non-object expense without integrity checker', {
            index,
            expense,
          })
          return false
        }

        return true
      })
    }

    console.time('safeExpenses')

    try {
      return validationList.filter((expense, index) => {
        const expenseId = getExpenseDebugValue(expense, 'id') ?? 'missing-id'
        console.log('[Expense Validation]', index, expenseId)

        try {
          const issues = getExpenseIntegrityIssues(expense, {
            accountsById: accountMap,
          })
          const errors = issues.filter((issue) => issue.severity === 'error')
          if (errors.length > 0) {
            console.warn('[expenses] skipping invalid expense record', {
              index,
              rawExpense: expense,
              keys: getExpenseDebugKeys(expense),
              expenseId,
              accountId: getExpenseDebugValue(expense, 'account_id') ?? null,
              amount: getExpenseDebugValue(expense, 'amount') ?? null,
              createdAt: getExpenseDebugValue(expense, 'created_at') ?? null,
              missing: {
                id: !getExpenseDebugValue(expense, 'id'),
                account_id: !getExpenseDebugValue(expense, 'account_id'),
                amount: getExpenseDebugValue(expense, 'amount') === null || getExpenseDebugValue(expense, 'amount') === undefined,
                date: !getExpenseDebugValue(expense, 'created_at'),
              },
              issues: errors,
              expense,
            })
            return false
          }
          return true
        } catch (error) {
          console.warn('[Expense Validation Failed]', {
            index,
            rawExpense: expense,
            keys: getExpenseDebugKeys(expense),
            expenseId,
            accountId: getExpenseDebugValue(expense, 'account_id') ?? null,
            amount: getExpenseDebugValue(expense, 'amount') ?? null,
            createdAt: getExpenseDebugValue(expense, 'created_at') ?? null,
            expense,
            error,
            ...getErrorDebugInfo(error),
          })
          return false
        }
      })
    } catch (error) {
      console.warn('[expenses] safeExpenses filter crashed before record validation completed', {
        sourceCount: expenseList.length,
        validationCount: validationList.length,
        validationLimit,
        accountCount: accounts.length,
        error,
        ...getErrorDebugInfo(error),
      })
      return []
    } finally {
      console.timeEnd('safeExpenses')
    }
  }, [expenseList, accountMap, accounts.length, skipExpenseIntegrity, debugExpenses])
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
    if (v === month) return
    logFilterChange('month', v)
    setMonth(v)
    if (day !== 'all') setDay('all')
    if (accountFilter !== 'all') setAccountFilter('all')
    if (accountTypeFilter !== 'all') setAccountTypeFilter('all')
  }

  const handleYearChange = (v: string | null) => {
    if (!v) return
    if (v === year) return
    logFilterChange('year', v)
    setYear(v)
    if (day !== 'all') setDay('all')
    if (accountFilter !== 'all') setAccountFilter('all')
    if (accountTypeFilter !== 'all') setAccountTypeFilter('all')
  }

  const handleAccountTypeFilter = (t: 'all' | 'asset' | 'liability') => {
    if (t === accountTypeFilter && accountFilter === 'all') return
    logFilterChange('accountType', t)
    if (t !== accountTypeFilter) setAccountTypeFilter(t)
    if (accountFilter !== 'all') setAccountFilter('all')
  }

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    return safeExpenses.filter((e) => {
      const note = typeof e.note === 'string' ? e.note : ''
      const category = typeof e.category === 'string' ? e.category : ''
      const sharedBudgetItem = typeof e.shared_budget_item === 'string' ? e.shared_budget_item : ''
      const matchesDay =
        day === 'all' || new Date(e.created_at).getDate() === Number(day)
      const matchesSearch =
        !query ||
        note.toLowerCase().includes(query) ||
        category.toLowerCase().includes(query) ||
        sharedBudgetItem.toLowerCase().includes(query)
      const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter
      const matchesAccount = accountFilter === 'all' || (e.account_id ?? '') === accountFilter
      const matchesReceipt = receiptFilter === 'all'
        || (receiptFilter === 'with' ? e.has_receipt === true : e.has_receipt !== true)
      const expAccount = e.account_id ? accountMap.get(e.account_id) : null
      const matchesType = accountTypeFilter === 'all'
        || (accountTypeFilter === 'liability' ? (!!expAccount && isLiabilityType(expAccount.type)) : (!!expAccount && !isLiabilityType(expAccount.type)))
      return matchesDay && matchesSearch && matchesCategory && matchesAccount && matchesReceipt && matchesType
    })
  }, [safeExpenses, day, deferredSearch, categoryFilter, accountFilter, receiptFilter, accountTypeFilter, accountMap])

  const totalFiltered = filtered.reduce((sum, e) => sum + e.amount, 0)
  const visibleFiltered = useMemo(
    () => filtered.slice(0, MAX_RENDERED_EXPENSES),
    [filtered]
  )

  const handleOpenDetails = (expense: Expense) => {
    if (isMobile) {
      router.push(`/expenses/${expense.id}`)
      return
    }

    setSelectedExpenseId(expense.id)
  }

  useEffect(() => {
    if (!debugExpenses) return

    console.debug('[expenses] filter state', {
      month,
      year,
      day,
      searchLength: search.length,
      deferredSearchLength: deferredSearch.length,
      categoryFilter,
      accountFilter,
      receiptFilter,
      accountTypeFilter,
      sourceCount: expenseList.length,
      safeCount: safeExpenses.length,
      filteredCount: filtered.length,
      renderedCount: visibleFiltered.length,
    })
  }, [
    month,
    year,
    day,
    search,
    deferredSearch,
    categoryFilter,
    accountFilter,
    receiptFilter,
    accountTypeFilter,
    expenseList.length,
    safeExpenses.length,
    filtered.length,
    visibleFiltered.length,
    debugExpenses,
  ])

  useEffect(() => {
    if (!debugExpenses) return

    console.debug('[expenses] url parameter updates', {
      status: 'not used on expenses page',
      pathname: typeof window === 'undefined' ? null : window.location.pathname,
      search: typeof window === 'undefined' ? null : window.location.search,
    })
  }, [debugExpenses])

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
        <Select value={day} onValueChange={(v: string | null) => {
          const next = v || 'all'
          if (next === day) return
          logFilterChange('day', next)
          setDay(next)
        }}>
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
          onChange={(e) => {
            logFilterChange('search', { length: e.target.value.length })
            setSearch(e.target.value)
          }}
          className="pl-9 h-10 rounded-xl"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              logFilterChange('search', { length: 0 })
              setSearch('')
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category + Account */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select value={categoryFilter} onValueChange={(v: string | null) => {
            const next = v || 'all'
            if (next === categoryFilter) return
            logFilterChange('category', next)
            setCategoryFilter(next)
          }}>
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
          <Select value={accountFilter} onValueChange={(v: string | null) => {
            const next = v || 'all'
            if (next === accountFilter) return
            logFilterChange('account', next)
            setAccountFilter(next)
          }}>
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
        <Select value={receiptFilter} onValueChange={(v: string | null) => {
          const next = (v || 'all') as typeof receiptFilter
          if (next === receiptFilter) return
          logFilterChange('receipt', next)
          setReceiptFilter(next)
        }}>
          <SelectTrigger className="h-10 rounded-xl w-full">
            <SelectValue placeholder="All expenses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All expenses</SelectItem>
            <SelectItem value="with">With receipt</SelectItem>
            <SelectItem value="without">Without receipt</SelectItem>
          </SelectContent>
        </Select>
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
            {search || categoryFilter !== 'all' || day !== 'all' || accountFilter !== 'all' || receiptFilter !== 'all' || accountTypeFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Add your first expense!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length > visibleFiltered.length && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              Showing the first {visibleFiltered.length} of {filtered.length} matching expenses. Narrow the filters to see fewer rows.
            </div>
          )}
          {visibleFiltered.map((expense) => (
            <ExpenseItem
              key={expense.id}
              expense={expense}
              onUpdate={updateExpense}
              onDelete={deleteExpense}
              onOpenDetails={handleOpenDetails}
              accounts={accounts}
            />
          ))}
        </div>
      )}

      <QuickAddButton onAdd={addExpense} />

      <Dialog open={Boolean(selectedExpenseId)} onOpenChange={(open) => {
        if (!open) setSelectedExpenseId(null)
      }}>
        <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto p-0">
          {selectedExpenseId ? (
            <ExpenseDetailsView
              expenseId={selectedExpenseId}
              onClose={() => setSelectedExpenseId(null)}
              onChanged={() => {
                void refetch()
              }}
              onDeleted={() => {
                setSelectedExpenseId(null)
                void refetch()
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
