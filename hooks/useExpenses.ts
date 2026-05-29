'use client'

import { useState, useEffect, useCallback } from 'react'
import { useExpenseStore } from '@/store/useExpenseStore'
import { getExpenses, createExpense, updateExpense, deleteExpense } from '@/services/expenses'
import { getBudgets, createBudget, updateBudget, deleteBudget } from '@/services/budgets'
import { ExpenseFormData, BudgetFormData } from '@/types'
import { getCurrentMonth } from '@/utils/format'
import { toast } from 'sonner'

export function useExpenses(month?: number, year?: number) {
  const { expenses, setExpenses, addExpense, updateExpense: updateStore, removeExpense, isLoading, setLoading } = useExpenseStore()
  const [error, setError] = useState<string | null>(null)

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getExpenses(month, year)
      setExpenses(data)
    } catch (err) {
      setError('Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }, [month, year, setExpenses, setLoading])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  const handleAddExpense = async (formData: ExpenseFormData) => {
    try {
      const newExpense = await createExpense(formData)
      if (newExpense) addExpense(newExpense)
      toast.success(formData.obligation_type === 'i_owe' ? 'Payable added!' : 'Expense added!')
      return newExpense
    } catch {
      toast.error('Failed to add expense')
      throw new Error('Failed to add expense')
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
    } catch {
      toast.error('Failed to update expense')
      throw new Error('Failed to update expense')
    }
  }

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteExpense(id)
      removeExpense(id)
      toast.success('Expense deleted')
    } catch {
      toast.error('Failed to delete expense')
      throw new Error('Failed to delete expense')
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
    fetchBudgets()
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
