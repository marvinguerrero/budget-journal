'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useExpenseStore } from '@/store/useExpenseStore'
import { getExpenses, createExpense, updateExpense, deleteExpense } from '@/services/expenses'
import { getBudgets, createBudget, updateBudget, deleteBudget } from '@/services/budgets'
import { Expense, ExpenseFormData, BudgetFormData } from '@/types'
import { getCurrentMonth } from '@/utils/format'
import { toast } from 'sonner'

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
  const { expenses, setExpenses, addExpense, updateExpense: updateStore, removeExpense, isLoading, setLoading } = useExpenseStore()
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const fetchExpenses = useCallback(async () => {
    const requestId = requestSeq.current + 1
    requestSeq.current = requestId
    setLoading(true)
    setError(null)
    try {
      const data = await getExpenses(month, year)
      const nextExpenses = sanitizeHookExpenses(`fetch:${requestId}`, data)
      if (requestId === requestSeq.current) {
        setExpenses(nextExpenses)
      }
    } catch {
      setError('Failed to load expenses')
    } finally {
      if (requestId === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [month, year, setExpenses, setLoading])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchExpenses()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchExpenses])

  const handleAddExpense = async (formData: ExpenseFormData) => {
    try {
      const newExpense = await createExpense(formData)
      if (newExpense) addExpense(newExpense)
      toast.success(formData.obligation_type === 'i_owe' ? 'Payable added!' : 'Expense added!')
      return newExpense
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add expense'
      toast.error(message)
      throw new Error(message)
    }
  }

  const handleUpdateExpense = async (id: string, formData: Partial<ExpenseFormData>) => {
    try {
      const updated = await updateExpense(id, formData)
      if (updated) {
        updateStore(id, updated)
        toast.success('Expense updated!')
      } else {
        removeExpense(id)
        toast.success('Payable added!')
      }
      return updated
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update expense'
      toast.error(message)
      throw new Error(message)
    }
  }

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteExpense(id)
      removeExpense(id)
      toast.success('Expense deleted')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete expense'
      toast.error(message)
    }
  }

  return {
    expenses,
    isLoading,
    error,
    refetch: fetchExpenses,
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
