'use client'

import { create } from 'zustand'
import { Expense, Budget, Category } from '@/types'

const DEBUG_EXPENSE_PIPELINE = process.env.NODE_ENV !== 'production'

interface ExpenseStore {
  expenses: Expense[]
  budgets: Budget[]
  categories: Category[]
  isLoading: boolean

  setExpenses: (expenses: Expense[]) => void
  appendExpenses: (expenses: Expense[]) => void
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

function getExpenseKeys(expense: unknown) {
  return expense && typeof expense === 'object' ? Object.keys(expense) : []
}

function getExpenseField(expense: unknown, field: string) {
  return expense && typeof expense === 'object'
    ? (expense as Record<string, unknown>)[field]
    : undefined
}

function logMalformedStoreExpense(source: string, expense: unknown, index?: number) {
  if (!DEBUG_EXPENSE_PIPELINE) return

  const keys = getExpenseKeys(expense)

  console.warn('[expenses] malformed expense rejected by store', {
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

function isNonEmptyExpenseObject(expense: unknown): expense is Expense {
  return Boolean(
    expense
      && typeof expense === 'object'
      && Object.keys(expense).length > 0
  )
}

function sanitizeStoreExpenses(source: string, expenses: Expense[]) {
  return expenses.filter((expense, index) => {
    const valid = isNonEmptyExpenseObject(expense)
    if (!valid) {
      logMalformedStoreExpense(source, expense, index)
    }
    return valid
  })
}

export const useExpenseStore = create<ExpenseStore>((set) => ({
  expenses: [],
  budgets: [],
  categories: [],
  isLoading: false,

  setExpenses: (expenses) => set({ expenses: sanitizeStoreExpenses('setExpenses', expenses) }),
  appendExpenses: (expenses) => {
    const sanitized = sanitizeStoreExpenses('appendExpenses', expenses)
    set((s) => {
      const existingIds = new Set(s.expenses.map((e) => e.id))
      const newExpenses = sanitized.filter((e) => !existingIds.has(e.id))
      return { expenses: [...s.expenses, ...newExpenses] }
    })
  },
  addExpense: (expense) => {
    if (!isNonEmptyExpenseObject(expense)) {
      logMalformedStoreExpense('addExpense', expense)
      return
    }

    set((s) => ({ expenses: [expense, ...s.expenses] }))
  },
  updateExpense: (id, updated) =>
    set((s) => ({
      expenses: s.expenses
        .map((e) => (e.id === id ? { ...e, ...updated } : e))
        .filter((expense, index) => {
          const valid = isNonEmptyExpenseObject(expense)
          if (!valid) {
            logMalformedStoreExpense('updateExpense', expense, index)
          }
          return valid
        }),
    })),
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
