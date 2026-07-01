'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useExpenseStore } from '@/store/useExpenseStore'
import { getExpenses, getExpensesTotalCount, createExpense, updateExpense, deleteExpense } from '@/services/expenses'
import { QUERY_LIMITS } from '@/lib/queryLimits'
import { getBudgets, createBudget, updateBudget, deleteBudget } from '@/services/budgets'
import { createSharedAccountExpense } from '@/services/sharedFinancialAccounts'
import { Expense, ExpenseFormData, BudgetFormData } from '@/types'
import { getCurrentMonth } from '@/utils/format'
import { toast } from 'sonner'
import { createActionTrace } from '@/lib/performance'

const DEBUG_EXPENSE_PIPELINE = process.env.NODE_ENV !== 'production'

function getExpenseKeys(expense: unknown) {
  return expense && typeof expense === 'object' ? Object.keys(expense) : []
}

function getExpenseField(expense: unknown, field: string) {
  return expense && typeof expense === 'object'
    ? (expense as Record<string, unknown>)[field]
    : undefined
}

function logMalformedHookExpense(source: string, expense: unknown, index?: number) {
  if (!DEBUG_EXPENSE_PIPELINE) return

  const keys = getExpenseKeys(expense)

  console.warn('[expenses] malformed expense entering hook/store handoff', {
    source,
    index,
    rawExpense: expense,
    keys,
    expenseId: getExpenseField(expense, 'id') ?? null,
    accountId: getExpenseField(expense, 'account_id') ?? null,
    amount: getExpenseField(expense, 'amount') ?? null,
    createdAt: getExpenseField(expense, 'created_at') ?? null,
    isEmptyObject: Boolean(expense && typeof expense === 'object' && keys.length === 0),
    isNull: expense === null,
    isUndefined: expense === undefined,
    missing: {
      id: !getExpenseField(expense, 'id'),
      account_id: !getExpenseField(expense, 'account_id'),
      amount: getExpenseField(expense, 'amount') === null || getExpenseField(expense, 'amount') === undefined,
      created_at: !getExpenseField(expense, 'created_at'),
    },
  })
}

function sanitizeHookExpenses(source: string, data: unknown): Expense[] {
  if (!Array.isArray(data)) {
    if (DEBUG_EXPENSE_PIPELINE) {
      console.warn('[expenses] hook received non-array expenses; using empty list', {
        source,
        type: data === null ? 'null' : typeof data,
        data,
      })
    }
    return []
  }

  return data.filter((expense, index) => {
    const isValidContainer = Boolean(
      expense
        && typeof expense === 'object'
        && Object.keys(expense).length > 0
    )
    if (!isValidContainer) {
      logMalformedHookExpense(source, expense, index)
    }
    return isValidContainer
  }) as Expense[]
}

export function useExpenses(month?: number, year?: number) {
  const { expenses, setExpenses, appendExpenses, addExpense, updateExpense: updateStore, removeExpense, isLoading, setLoading } = useExpenseStore()
  const [error, setError] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isLoadingAll, setIsLoadingAll] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const offsetRef = useRef(0)
  const requestSeq = useRef(0)

  const fetchExpenses = useCallback(async () => {
    const trace = createActionTrace('expenses.refetch', { month, year })
    const requestId = requestSeq.current + 1
    requestSeq.current = requestId
    offsetRef.current = 0
    setLoading(true)
    setError(null)
    setHasMore(true)
    try {
      const [data, count] = await Promise.all([
        trace.step('supabase.select.expenses', () => getExpenses(month, year, 0)),
        trace.step('supabase.count.expenses', () => getExpensesTotalCount(month, year)),
      ])
      const nextExpenses = sanitizeHookExpenses(`fetch:${requestId}`, data)
      if (requestId === requestSeq.current) {
        setExpenses(nextExpenses)
        offsetRef.current = nextExpenses.length
        setHasMore(nextExpenses.length === QUERY_LIMITS.expenses)
        setTotalCount(count)
      }
    } catch {
      setError('Failed to load expenses')
    } finally {
      if (requestId === requestSeq.current) {
        setLoading(false)
      }
      trace.end()
    }
  }, [month, year, setExpenses, setLoading])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || isLoadingAll || !hasMore) return
    setIsLoadingMore(true)
    try {
      const data = await getExpenses(month, year, offsetRef.current)
      const nextExpenses = sanitizeHookExpenses('loadMore', data)
      appendExpenses(nextExpenses)
      offsetRef.current += nextExpenses.length
      setHasMore(nextExpenses.length === QUERY_LIMITS.expenses)
    } catch {
      toast.error('Failed to load more expenses')
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, isLoadingAll, hasMore, month, year, appendExpenses])

  const loadAllRemaining = useCallback(async () => {
    if (isLoadingMore || isLoadingAll || !hasMore) return
    setIsLoadingAll(true)
    try {
      let nextOffset = offsetRef.current
      let morePages = true

      while (morePages) {
        const data = await getExpenses(month, year, nextOffset)
        const nextExpenses = sanitizeHookExpenses('loadAllRemaining', data)
        appendExpenses(nextExpenses)
        nextOffset += nextExpenses.length
        morePages = nextExpenses.length === QUERY_LIMITS.expenses
      }

      offsetRef.current = nextOffset
      setHasMore(false)
    } catch {
      toast.error('Failed to load all matching expenses')
    } finally {
      setIsLoadingAll(false)
    }
  }, [isLoadingMore, isLoadingAll, hasMore, month, year, appendExpenses])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchExpenses()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchExpenses])

  const handleAddExpense = async (formData: ExpenseFormData) => {
    const trace = createActionTrace('expense.add', {
      hasReceipt: Boolean(formData.receipt_file),
      obligationType: formData.obligation_type ?? 'normal',
    })
    try {
      const newExpense = await trace.step('service.create_expense', () => (
        formData.shared_account_id
          ? createSharedAccountExpense({
            sharedAccountId: formData.shared_account_id,
            amount: formData.amount,
            category: formData.category,
            note: formData.note,
            createdAt: formData.created_at,
          })
          : createExpense(formData)
      ))
      await trace.step('local_state.insert', async () => {
        if (newExpense) addExpense(newExpense)
      })
      toast.success(formData.obligation_type === 'i_owe' ? 'Payable added!' : 'Expense added!')
      return newExpense
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add expense'
      toast.error(message)
      throw new Error(message)
    } finally {
      trace.end()
    }
  }

  const handleUpdateExpense = async (id: string, formData: Partial<ExpenseFormData>) => {
    const trace = createActionTrace('expense.edit', {
      hasReceipt: Boolean(formData.receipt_file),
      removesReceipt: Boolean(formData.remove_receipt),
    })
    try {
      const updated = await trace.step('service.update_expense', () => updateExpense(id, formData))
      await trace.step('local_state.update', async () => {
        if (updated) {
          updateStore(id, updated)
          toast.success('Expense updated!')
        } else {
          removeExpense(id)
          toast.success('Payable added!')
        }
      })
      return updated
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update expense'
      toast.error(message)
      throw new Error(message)
    } finally {
      trace.end()
    }
  }

  const handleDeleteExpense = async (id: string) => {
    const trace = createActionTrace('expense.delete')
    try {
      await trace.step('service.delete_expense', () => deleteExpense(id))
      await trace.step('local_state.remove', async () => removeExpense(id))
      toast.success('Expense deleted')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete expense'
      toast.error(message)
    } finally {
      trace.end()
    }
  }

  return {
    expenses,
    isLoading,
    isLoadingMore,
    isLoadingAll,
    hasMore,
    totalCount,
    error,
    refetch: fetchExpenses,
    loadMore,
    loadAllRemaining,
    addExpense: handleAddExpense,
    updateExpense: handleUpdateExpense,
    deleteExpense: handleDeleteExpense,
  }
}

export function useBudgets(month?: number, year?: number) {
  const { budgets, setBudgets, addBudget, updateBudget: updateBudgetStore, removeBudget } = useExpenseStore()
  const [isLoading, setIsLoading] = useState(false)

  const { month: currentMonth, year: currentYear } = getCurrentMonth()
  const targetMonth = month || currentMonth
  const targetYear = year || currentYear

  const fetchBudgets = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getBudgets(targetMonth, targetYear)
      setBudgets(data)
    } catch {
      toast.error('Failed to load budgets')
    } finally {
      setIsLoading(false)
    }
  }, [targetMonth, targetYear, setBudgets])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchBudgets()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchBudgets])

  const handleAddBudget = async (formData: BudgetFormData) => {
    try {
      const newBudget = await createBudget(formData)
      addBudget(newBudget)
      toast.success('Budget set!')
      return newBudget
    } catch {
      toast.error('Failed to set budget')
      throw new Error('Failed to set budget')
    }
  }

  const handleUpdateBudget = async (id: string, amount: number) => {
    try {
      const updated = await updateBudget(id, amount)
      updateBudgetStore(id, updated)
      toast.success('Budget updated!')
      return updated
    } catch {
      toast.error('Failed to update budget')
      throw new Error('Failed to update budget')
    }
  }

  const handleDeleteBudget = async (id: string) => {
    try {
      await deleteBudget(id)
      removeBudget(id)
      toast.success('Budget removed')
    } catch {
      toast.error('Failed to remove budget')
      throw new Error('Failed to remove budget')
    }
  }

  return {
    budgets,
    isLoading,
    refetch: fetchBudgets,
    addBudget: handleAddBudget,
    updateBudget: handleUpdateBudget,
    deleteBudget: handleDeleteBudget,
  }
}
