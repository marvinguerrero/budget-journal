'use client'

import { create } from 'zustand'
import { Expense, Budget, Category } from '@/types'

interface ExpenseStore {
  expenses: Expense[]
  budgets: Budget[]
  categories: Category[]
  isLoading: boolean

  setExpenses: (expenses: Expense[]) => void
  addExpense: (expense: Expense) => void
  updateExpense: (id: string, expense: Partial<Expense>) => void
  removeExpense: (id: string) => void

  setBudgets: (budgets: Budget[]) => void
  addBudget: (budget: Budget) => void
  updateBudget: (id: string, budget: Partial<Budget>) => void
  removeBudget: (id: string) => void

  setCategories: (categories: Category[]) => void
  addCategory: (category: Category) => void
  updateCategory: (id: string, category: Partial<Category>) => void
  removeCategory: (id: string) => void

  setLoading: (loading: boolean) => void
}

export const useExpenseStore = create<ExpenseStore>((set) => ({
  expenses: [],
  budgets: [],
  categories: [],
  isLoading: false,

  setExpenses: (expenses) => set({ expenses }),
  addExpense: (expense) => set((s) => ({ expenses: [expense, ...s.expenses] })),
  updateExpense: (id, updated) =>
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...updated } : e)) })),
  removeExpense: (id) => set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),

  setBudgets: (budgets) => set({ budgets }),
  addBudget: (budget) => set((s) => ({ budgets: [budget, ...s.budgets] })),
  updateBudget: (id, updated) =>
    set((s) => ({ budgets: s.budgets.map((b) => (b.id === id ? { ...b, ...updated } : b)) })),
  removeBudget: (id) => set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) })),

  setCategories: (categories) => set({ categories }),
  addCategory: (category) => set((s) => ({ categories: [...s.categories, category] })),
  updateCategory: (id, updated) =>
    set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, ...updated } : c)) })),
  removeCategory: (id) => set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })),

  setLoading: (isLoading) => set({ isLoading }),
}))
