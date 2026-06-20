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
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { DEFAULT_CATEGORIES, isLiabilityType } from '@/lib/constants'
import { formatCurrency, getMonthName } from '@/utils/format'
import { exportExpensesToExcel } from '@/utils/exportExcel'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import { createActionTrace } from '@/lib/performance'
import { getExpenseIntegrityIssues } from '@/lib/expenseIntegrity'
import { Expense } from '@/types'
import { Search, X, Download, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { BottomSheet } from '@/components/common/BottomSheet'
import { FilterCheckboxGroup } from '@/components/common/FilterCheckboxGroup'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: getMonthName(i + 1),
}))

const YEARS = [2024, 2025, 2026].map(String)
const MAX_RENDERED_EXPENSES = 250

interface ExpenseFilters {
  categories: string[]
  accounts: string[]
  accountTypes: string[]
  expenseTypes: string[]
  receiptStatus: string[]
  creditCard: string[]
  sharedStatus: string[]
  currencies: string[]
}

const EMPTY_FILTERS: ExpenseFilters = {
  categories: [],
  accounts: [],
  accountTypes: [],
  expenseTypes: [],
  receiptStatus: [],
  creditCard: [],
  sharedStatus: [],
  currencies: [],
}

function countActiveFilters(filters: ExpenseFilters): number {
  return Object.values(filters).reduce((sum, arr) => sum + arr.length, 0)
}

function deriveExpenseType(expense: Expense): 'personal' | 'owe_me' | 'i_owe' | 'shared_budget' {
  if (expense.is_shared_budget_expense) return 'shared_budget'
  const obligations = expense.personal_obligations ?? []
  if (obligations.some((o) => o.direction === 'owed_to_user')) return 'owe_me'
  if (obligations.some((o) => o.direction === 'user_owes')) return 'i_owe'
  return 'personal'
}

const EXPENSE_TYPE_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'owe_me', label: 'Owe Me' },
  { value: 'i_owe', label: 'I Owe' },
  { value: 'shared_budget', label: 'Shared Budget' },
] as const

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'asset', label: '💰 Assets' },
  { value: 'liability', label: '💳 Liabilities' },
] as const

const RECEIPT_OPTIONS = [
  { value: 'with', label: 'With receipt' },
  { value: 'without', label: 'Without receipt' },
] as const

const CREDIT_CARD_OPTIONS = [
  { value: 'yes', label: 'Credit card' },
  { value: 'no', label: 'Not a credit card' },
] as const

const SHARED_STATUS_OPTIONS = [
  { value: 'shared', label: 'Shared budget expense' },
  { value: 'personal', label: 'Personal expense' },
] as const

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
  const [selectedYears, setSelectedYears] = useState<string[]>([String(now.getFullYear())])
  const [selectedMonths, setSelectedMonths] = useState<string[]>([String(now.getMonth() + 1)])
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [dateFiltersOpen, setDateFiltersOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [appliedFilters, setAppliedFilters] = useState<ExpenseFilters>(EMPTY_FILTERS)
  const [draftFilters, setDraftFilters] = useState<ExpenseFilters>(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
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

  // Multi-select years/months requires filtering across more than one
  // month/year window, so we fetch everything once and filter client-side
  // (consistent with the other checkbox filters, which already do this).
  const { expenses, isLoading, refetch, addExpense, updateExpense, deleteExpense } = useExpenses()
  const { accounts } = useFinancialAccounts()
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const [isExporting, setIsExporting] = useState(false)
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
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>(['PHP'])
    for (const e of safeExpenses) {
      if (e.original_currency) set.add(e.original_currency)
    }
    return Array.from(set).sort()
  }, [safeExpenses])

  const toggleDateValue = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    filterName: string,
    value: string,
  ) => {
    setter((prev) => {
      const next = prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
      logFilterChange(filterName, next)
      return next
    })
  }

  const allMonthValues = MONTHS.map((m) => m.value)
  const dayValues = Array.from({ length: 31 }, (_, i) => String(i + 1))

  const clearDateFilters = () => {
    logFilterChange('clearDateFilters', true)
    setSelectedYears([])
    setSelectedMonths([])
    setSelectedDays([])
  }

  const dateFilterCount = selectedYears.length + selectedMonths.length + selectedDays.length

  const openFilters = () => {
    setDraftFilters(appliedFilters)
    setShowFilters(true)
  }

  const toggleDraftValue = (key: keyof ExpenseFilters, value: string) => {
    setDraftFilters((prev) => {
      const current = prev[key]
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      return { ...prev, [key]: next }
    })
  }

  const handleApplyFilters = () => {
    logFilterChange('appliedFilters', draftFilters)
    setAppliedFilters(draftFilters)
    setShowFilters(false)
  }

  const handleClearDraftFilters = () => {
    setDraftFilters(EMPTY_FILTERS)
  }

  const activeFilterCount = useMemo(() => countActiveFilters(appliedFilters), [appliedFilters])

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    return safeExpenses.filter((e) => {
      const note = typeof e.note === 'string' ? e.note : ''
      const category = typeof e.category === 'string' ? e.category : ''
      const sharedBudgetItem = typeof e.shared_budget_item === 'string' ? e.shared_budget_item : ''

      const expDate = new Date(e.created_at)
      const matchesYear = selectedYears.length === 0 || selectedYears.includes(String(expDate.getFullYear()))
      const matchesMonth = selectedMonths.length === 0 || selectedMonths.includes(String(expDate.getMonth() + 1))
      const matchesDay = selectedDays.length === 0 || selectedDays.includes(String(expDate.getDate()))

      const matchesSearch =
        !query ||
        note.toLowerCase().includes(query) ||
        category.toLowerCase().includes(query) ||
        sharedBudgetItem.toLowerCase().includes(query)

      const expAccount = e.account_id ? accountMap.get(e.account_id) : null

      // Each group: empty selection = no filter applied (OR within the group).
      const matchesCategory = appliedFilters.categories.length === 0
        || appliedFilters.categories.includes(e.category)
      const matchesAccount = appliedFilters.accounts.length === 0
        || appliedFilters.accounts.includes(e.account_id ?? '')
      const matchesAccountType = appliedFilters.accountTypes.length === 0
        || (!!expAccount && appliedFilters.accountTypes.includes(isLiabilityType(expAccount.type) ? 'liability' : 'asset'))
      const matchesExpenseType = appliedFilters.expenseTypes.length === 0
        || appliedFilters.expenseTypes.includes(deriveExpenseType(e))
      const matchesReceipt = appliedFilters.receiptStatus.length === 0
        || appliedFilters.receiptStatus.includes(e.has_receipt ? 'with' : 'without')
      const matchesCreditCard = appliedFilters.creditCard.length === 0
        || appliedFilters.creditCard.includes(expAccount?.type === 'credit' ? 'yes' : 'no')
      const matchesSharedStatus = appliedFilters.sharedStatus.length === 0
        || appliedFilters.sharedStatus.includes(e.is_shared_budget_expense ? 'shared' : 'personal')
      const matchesCurrency = appliedFilters.currencies.length === 0
        || appliedFilters.currencies.includes(e.original_currency ?? 'PHP')

      // AND across groups.
      return matchesYear && matchesMonth && matchesDay && matchesSearch
        && matchesCategory && matchesAccount && matchesAccountType && matchesExpenseType
        && matchesReceipt && matchesCreditCard && matchesSharedStatus && matchesCurrency
    })
  }, [safeExpenses, selectedYears, selectedMonths, selectedDays, deferredSearch, appliedFilters, accountMap])

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
      selectedYears,
      selectedMonths,
      selectedDays,
      searchLength: search.length,
      deferredSearchLength: deferredSearch.length,
      appliedFilters,
      sourceCount: expenseList.length,
      safeCount: safeExpenses.length,
      filteredCount: filtered.length,
      renderedCount: visibleFiltered.length,
    })
  }, [
    selectedYears,
    selectedMonths,
    selectedDays,
    search,
    deferredSearch,
    appliedFilters,
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
            disabled={filtered.length === 0 || isExporting}
            onClick={async () => {
              setIsExporting(true)
              try {
                await exportExpensesToExcel(filtered, accounts, {
                  // Filename labels only make sense for a single value; multi-select
                  // exports just fall back to "All-Months"/"All-Years" in the filename.
                  month: selectedMonths.length === 1 ? Number(selectedMonths[0]) : undefined,
                  year: selectedYears.length === 1 ? Number(selectedYears[0]) : undefined,
                  day: selectedDays.length === 1 ? selectedDays[0] : 'all',
                })
              } catch {
                toast.error('Failed to export expenses')
              } finally {
                setIsExporting(false)
              }
            }}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export'}</span>
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl w-full justify-between"
          onClick={() => setDateFiltersOpen(true)}
        >
          <span>Date</span>
          {dateFilterCount > 0 && (
            <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5">
              {dateFilterCount}
            </span>
          )}
        </Button>
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

      {/* Filters trigger */}
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-xl w-full justify-between"
        onClick={openFilters}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </span>
        {activeFilterCount > 0 && (
          <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5">
            {activeFilterCount}
          </span>
        )}
      </Button>

      {isLoading ? (
        <ExpenseListSkeleton />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-4xl">💸</p>
          <p className="font-semibold">No expenses found</p>
          <p className="text-sm text-muted-foreground">
            {search || dateFilterCount > 0 || activeFilterCount > 0
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
                const trace = createActionTrace('expenses.background_refetch.after_detail_change')
                void trace.step('refetch.expenses', () => refetch())
                  .catch((error) => {
                    toast.error(error instanceof Error ? error.message : 'Failed to refresh expenses')
                  })
                  .finally(() => trace.end())
              }}
              onDeleted={() => {
                setSelectedExpenseId(null)
                const trace = createActionTrace('expenses.background_refetch.after_delete')
                void trace.step('refetch.expenses', () => refetch())
                  .catch((error) => {
                    toast.error(error instanceof Error ? error.message : 'Failed to refresh expenses')
                  })
                  .finally(() => trace.end())
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {isMobile ? (
        <BottomSheet open={showFilters} onClose={() => setShowFilters(false)} title="Filters">
          <FilterPanel
            draftFilters={draftFilters}
            toggleDraftValue={toggleDraftValue}
            onApply={handleApplyFilters}
            onClearAll={handleClearDraftFilters}
            accounts={accounts}
            availableCurrencies={availableCurrencies}
          />
        </BottomSheet>
      ) : (
        <Dialog open={showFilters} onOpenChange={setShowFilters}>
          <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold">Filters</h2>
            <FilterPanel
              draftFilters={draftFilters}
              toggleDraftValue={toggleDraftValue}
              onApply={handleApplyFilters}
              onClearAll={handleClearDraftFilters}
              accounts={accounts}
              availableCurrencies={availableCurrencies}
            />
          </DialogContent>
        </Dialog>
      )}

      {isMobile ? (
        <BottomSheet open={dateFiltersOpen} onClose={() => setDateFiltersOpen(false)} title="Date">
          <DateFilterPanel
            years={YEARS}
            months={MONTHS}
            days={dayValues}
            selectedYears={selectedYears}
            selectedMonths={selectedMonths}
            selectedDays={selectedDays}
            toggleDateValue={toggleDateValue}
            setSelectedYears={setSelectedYears}
            setSelectedMonths={setSelectedMonths}
            setSelectedDays={setSelectedDays}
            clearDateFilters={clearDateFilters}
            selectAllMonths={() => {
              logFilterChange('months', allMonthValues)
              setSelectedMonths(allMonthValues)
            }}
            onDone={() => setDateFiltersOpen(false)}
          />
        </BottomSheet>
      ) : (
        <Dialog open={dateFiltersOpen} onOpenChange={setDateFiltersOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold">Date</h2>
            <DateFilterPanel
              years={YEARS}
              months={MONTHS}
              days={dayValues}
              selectedYears={selectedYears}
              selectedMonths={selectedMonths}
              selectedDays={selectedDays}
              toggleDateValue={toggleDateValue}
              setSelectedYears={setSelectedYears}
              setSelectedMonths={setSelectedMonths}
              setSelectedDays={setSelectedDays}
              clearDateFilters={clearDateFilters}
              selectAllMonths={() => {
                logFilterChange('months', allMonthValues)
                setSelectedMonths(allMonthValues)
              }}
              onDone={() => setDateFiltersOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function DateFilterPanel({
  years,
  months,
  days,
  selectedYears,
  selectedMonths,
  selectedDays,
  toggleDateValue,
  setSelectedYears,
  setSelectedMonths,
  setSelectedDays,
  clearDateFilters,
  selectAllMonths,
  onDone,
}: {
  years: string[]
  months: ReadonlyArray<{ value: string; label: string }>
  days: string[]
  selectedYears: string[]
  selectedMonths: string[]
  selectedDays: string[]
  toggleDateValue: (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    filterName: string,
    value: string,
  ) => void
  setSelectedYears: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedMonths: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedDays: React.Dispatch<React.SetStateAction<string[]>>
  clearDateFilters: () => void
  selectAllMonths: () => void
  onDone: () => void
}) {
  const activeCount = selectedYears.length + selectedMonths.length + selectedDays.length

  return (
    <div className="space-y-5 py-2">
      <FilterCheckboxGroup
        title="Year"
        options={years.map((year) => ({ value: year, label: year }))}
        selected={selectedYears}
        onToggle={(value) => toggleDateValue(setSelectedYears, 'years', value)}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Month</p>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={selectAllMonths}>
            All Months
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {months.map((month) => {
            const checked = selectedMonths.includes(month.value)
            return (
              <label
                key={month.value}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors',
                  checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleDateValue(setSelectedMonths, 'months', month.value)}
                  className="h-4 w-4 rounded accent-primary"
                />
                {month.label.slice(0, 3)}
              </label>
            )
          })}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Day</p>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const checked = selectedDays.includes(day)
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDateValue(setSelectedDays, 'days', day)}
                className={cn(
                  'h-9 rounded-lg border text-xs font-semibold transition-colors',
                  checked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                )}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex gap-3 pt-2 sticky bottom-0 bg-background pb-1">
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={clearDateFilters}>
          Clear
        </Button>
        <Button type="button" className="flex-1 h-11 rounded-xl font-semibold" onClick={onDone}>
          Done{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>
      </div>
    </div>
  )
}

function FilterPanel({
  draftFilters, toggleDraftValue, onApply, onClearAll, accounts, availableCurrencies,
}: {
  draftFilters: ExpenseFilters
  toggleDraftValue: (key: keyof ExpenseFilters, value: string) => void
  onApply: () => void
  onClearAll: () => void
  accounts: Array<{ id: string; emoji: string; name: string }>
  availableCurrencies: string[]
}) {
  const draftCount = countActiveFilters(draftFilters)

  return (
    <div className="space-y-5 py-2">
      <FilterCheckboxGroup
        title="Category"
        options={DEFAULT_CATEGORIES.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` }))}
        selected={draftFilters.categories}
        onToggle={(v) => toggleDraftValue('categories', v)}
      />
      <FilterCheckboxGroup
        title="Source Account"
        options={accounts.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` }))}
        selected={draftFilters.accounts}
        onToggle={(v) => toggleDraftValue('accounts', v)}
      />
      <FilterCheckboxGroup
        title="Source Account Type"
        options={ACCOUNT_TYPE_OPTIONS}
        selected={draftFilters.accountTypes}
        onToggle={(v) => toggleDraftValue('accountTypes', v)}
      />
      <FilterCheckboxGroup
        title="Expense Type"
        options={EXPENSE_TYPE_OPTIONS}
        selected={draftFilters.expenseTypes}
        onToggle={(v) => toggleDraftValue('expenseTypes', v)}
      />
      <FilterCheckboxGroup
        title="Receipt Status"
        options={RECEIPT_OPTIONS}
        selected={draftFilters.receiptStatus}
        onToggle={(v) => toggleDraftValue('receiptStatus', v)}
      />
      <FilterCheckboxGroup
        title="Credit Card"
        options={CREDIT_CARD_OPTIONS}
        selected={draftFilters.creditCard}
        onToggle={(v) => toggleDraftValue('creditCard', v)}
      />
      <FilterCheckboxGroup
        title="Shared Expense Status"
        options={SHARED_STATUS_OPTIONS}
        selected={draftFilters.sharedStatus}
        onToggle={(v) => toggleDraftValue('sharedStatus', v)}
      />
      <FilterCheckboxGroup
        title="Currency"
        options={availableCurrencies.map((c) => ({ value: c, label: c }))}
        selected={draftFilters.currencies}
        onToggle={(v) => toggleDraftValue('currencies', v)}
      />

      <div className="flex gap-3 pt-2 sticky bottom-0 bg-background pb-1">
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={onClearAll}>
          Clear All
        </Button>
        <Button type="button" className="flex-1 h-11 rounded-xl font-semibold" onClick={onApply}>
          Apply Filters{draftCount > 0 ? ` (${draftCount})` : ''}
        </Button>
      </div>
    </div>
  )
}
