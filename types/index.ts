export interface User {
  id: string
  email: string
  created_at: string
}

export interface Expense {
  id: string
  user_id: string
  amount: number
  category: string
  note: string
  payment_method?: string
  created_at: string
}

export interface Budget {
  id: string
  user_id: string
  category: string
  amount: number
  month: number
  year: number
  created_at: string
}

export interface Category {
  id: string
  user_id: string | null
  name: string
  icon: string
  color: string
  is_default: boolean
  created_at: string
}

export interface PaymentMethod {
  id: string
  user_id: string | null
  name: string
  emoji: string
  is_default: boolean
  created_at: string
}

export interface ExpenseFormData {
  amount: number
  category: string
  note: string
  payment_method?: string
  created_at?: string
}

export interface BudgetFormData {
  category: string
  amount: number
  month: number
  year: number
}

export interface CategoryFormData {
  name: string
  icon: string
  color: string
}

export interface PaymentMethodFormData {
  name: string
  emoji: string
}

export interface DashboardStats {
  totalExpenses: number
  totalBudget: number
  remainingBudget: number
  topCategory: string
  dailyAverage: number
}

export interface CategoryBreakdown {
  category: string
  amount: number
  percentage: number
  icon: string
  color: string
}

export interface SpendingTrend {
  date: string
  amount: number
}
