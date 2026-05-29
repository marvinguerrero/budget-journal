export interface User {
  id: string
  email: string
  created_at: string
}

export interface SharedGroup {
  id: string
  name: string
  emoji: string
  owner_id: string
  created_at: string
}

export interface SharedGroupMember {
  id: string
  group_id: string
  user_id: string
  email: string
  can_edit_budget: boolean
  can_invite_members: boolean
  created_at: string
}

export interface PermissionRequest {
  id: string
  group_id: string
  user_id: string
  user_email: string
  type: 'edit_access' | 'invite_permission'
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface SharedBudget {
  id: string
  group_id: string
  category: string
  amount: number
  created_at: string
}

export interface IncomeSource {
  id: string
  user_id: string | null
  name: string
  emoji: string
  color: string
  is_default: boolean
  created_at: string
}

export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit' | 'savings' | 'investment' | 'loan'
export type AccountCategory = 'asset' | 'liability'

export interface FinancialAccount {
  id: string
  user_id: string
  name: string
  emoji: string
  color: string
  type: AccountType
  category: AccountCategory
  balance: number
  created_at: string
}

export interface FinancialAccountFormData {
  name: string
  emoji: string
  color: string
  type: AccountType
  balance: number
}

export type IncomeStatus = 'expected' | 'received'

export interface IncomeEntry {
  id: string
  user_id: string
  income_source_id: string
  account_id: string | null
  amount: number
  note: string
  status: IncomeStatus
  received_at: string
  created_at: string
}

export interface IncomeSourceFormData {
  name: string
  emoji: string
  color: string
}

export interface IncomeEntryFormData {
  income_source_id: string
  account_id?: string | null
  amount: number
  note: string
  status?: IncomeStatus
  received_at: string
}

export interface AppNotification {
  id: string
  user_id: string
  type:
    | 'chat_message'
    | 'group_invite'
    | 'permission_approved'
    | 'member_joined'
    | 'settlement_received'
    | 'settlement_confirmed'
    | 'settlement_rejected'
    | 'payment_source_pending'
  title: string
  message: string
  is_read: boolean
  related_id: string | null
  created_at: string
}

export type SettlementStatus = 'pending_confirmation' | 'confirmed' | 'rejected' | 'recalled'

export interface SharedExpenseSettlement {
  id: string
  group_id: string
  payer_user_id: string
  payer_email: string
  receiver_user_id: string
  receiver_email: string
  amount: number
  payer_account_id: string | null
  receiver_account_id: string | null
  expense_id: string | null
  income_entry_id: string | null
  status: SettlementStatus
  note: string
  created_at: string
  confirmed_at: string | null
}

export interface GroupMessage {
  id: string
  group_id: string
  user_id: string
  user_email: string
  message: string
  created_at: string
}

export type SplitMode = 'equal' | 'custom'

export type PaymentSourceStatus = 'pending' | 'confirmed'

export interface SharedExpense {
  id: string
  group_id: string
  user_id: string
  user_email: string
  category: string
  amount: number
  note: string
  paid_by_user_id: string | null
  paid_by_email: string
  split_mode: SplitMode
  account_id: string | null
  payment_source_status: PaymentSourceStatus
  created_at: string
}

export interface SharedExpenseSplit {
  id: string
  expense_id: string
  debtor_user_id: string
  debtor_email: string
  amount: number
  created_at: string
}

export interface Expense {
  id: string
  user_id: string
  amount: number
  category: string
  note: string
  account_id?: string | null
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

export interface ExpenseFormData {
  amount: number
  category: string
  note: string
  account_id?: string | null
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

export interface AccountTransfer {
  id: string
  user_id: string
  from_account_id: string
  to_account_id: string
  amount: number
  note: string
  transferred_at: string
  created_at: string
}

export interface AccountTransferFormData {
  from_account_id: string
  to_account_id: string
  amount: number
  note: string
  transferred_at: string
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
