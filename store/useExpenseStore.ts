'use client'

import { create } from 'zustand'
import { Expense, Budget, Category, PaymentMethod } from '@/types'

interface ExpenseStore {
  expenses: Expense[]
  budgets: Budget[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
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

  setPaymentMethods: (paymentMethods: PaymentMethod[]) => void
  addPaymentMethod: (pm: PaymentMethod) => void
  updatePaymentMethod: (id: string, pm: Partial<PaymentMethod>) => void
  removePaymentMethod: (id: string) => void

  setLoading: (loading: boolean) => void
}

export const useExpenseStore = create<ExpenseStore>((set) => ({
  expenses: [],
  budgets: [],
  categories: [],
  paymentMethods: [],
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

  setPaymentMethods: (paymentMethods) => set({ paymentMethods }),
  addPaymentMethod: (pm) => set((s) => ({ paymentMethods: [...s.paymentMethods, pm] })),
  updatePaymentMethod: (id, updated) =>
    set((s) => ({
      paymentMethods: s.paymentMethods.map((p) => (p.id === id ? { ...p, ...updated } : p)),
    })),
  removePaymentMethod: (id) =>
    set((s) => ({ paymentMethods: s.paymentMethods.filter((p) => p.id !== id) })),

  setLoading: (isLoading) => set({ isLoading }),
}))
