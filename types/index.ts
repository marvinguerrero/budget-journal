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
  item: string
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

export type AccountType = string
export type AccountCategory = 'asset' | 'liability'

export interface FinancialAccountType {
  id: string
  user_id: string | null
  name: string
  category: AccountCategory
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface FinancialAccount {
  id: string
  user_id: string
  name: string
  emoji: string
  color: string
  type: AccountType
  category: AccountCategory
  balance: number
  credit_limit?: number | null
  soa_day?: number | null
  due_day?: number | null
  last_statement_date?: string | null
  created_at: string
}

export interface FinancialAccountFormData {
  name: string
  emoji: string
  color: string
  type: AccountType
  category?: AccountCategory
  balance: number
  credit_limit?: number | null
  soa_day?: number | null
  due_day?: number | null
  last_statement_date?: string | null
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
    | 'contact_request'
    | 'personal_debt_created'
  title: string
  message: string
  is_read: boolean
  related_id: string | null
  created_at: string
}

export type SettlementStatus = 'pending_confirmation' | 'confirmed' | 'rejected' | 'recalled'
export type PersonalObligationDirection = 'owed_to_user' | 'user_owes'
export type PersonalObligationStatus = 'open' | 'settled'

export interface SharedExpenseSettlement {
  id: string
  group_id: string
  payer_user_id: string
  payer_email: string
  receiver_user_id: string
  receiver_email: string
  amount: number
  original_amount?: number | null
  confirmed_amount?: number | null
  payer_account_id: string | null
  receiver_account_id: string | null
  expense_id: string | null
  income_entry_id: string | null
  status: SettlementStatus
  note: string
  created_at: string
  confirmed_at: string | null
  confirmed_by_user_id?: string | null
  confirmation_reversed_at?: string | null
  payer_account_label?: string | null
  receiver_account_label?: string | null
  account_movement_processed?: boolean
  account_movement_processed_at?: string | null
}

export interface PersonalObligation {
  id: string
  user_id: string
  direction: PersonalObligationDirection
  contact_id?: string | null
  relationship_id?: string | null
  counterparty_obligation_id?: string | null
  created_by_user_id?: string | null
  contact_user_id: string | null
  contact_name: string
  contact_email: string | null
  amount: number
  remaining_amount: number
  category: string
  note: string
  source_expense_id: string | null
  status: PersonalObligationStatus
  created_at: string
  settled_at: string | null
}

export interface PersonalObligationSettlement {
  id: string
  obligation_id: string
  user_id: string
  amount: number
  original_amount?: number | null
  confirmed_amount?: number | null
  payer_account_id: string | null
  receiver_account_id: string | null
  relationship_id?: string | null
  counterparty_settlement_id?: string | null
  status: Extract<SettlementStatus, 'pending_confirmation' | 'confirmed' | 'recalled'>
  note: string
  created_at: string
  confirmed_at: string | null
  recalled_at: string | null
  confirmed_by_user_id?: string | null
  confirmation_reversed_at?: string | null
  account_movement_processed?: boolean
  account_movement_processed_at?: string | null
}

export type ContactType = 'external' | 'registered'

export interface Contact {
  id: string
  user_id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  contact_type: ContactType
  link_status?: 'none' | 'pending' | 'connected' | 'declined'
  linked_user_id: string | null
  created_at: string
  updated_at: string
}

export type ContactRequestStatus = 'pending' | 'accepted' | 'declined'

export interface ContactRequest {
  id: string
  requester_user_id: string
  target_user_id: string
  status: ContactRequestStatus
  created_at: string
  responded_at: string | null
}

export interface ContactFormData {
  name: string
  email?: string | null
  phone?: string | null
  notes?: string | null
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
  shared_budget_id: string | null
  expense_id: string | null
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
  shared_expense_id?: string | null
  shared_group_id?: string | null
  shared_budget_id?: string | null
  shared_budget_item?: string | null
  is_shared_budget_expense?: boolean
  credit_billing_cycle_start?: string | null
  credit_billing_cycle_end?: string | null
  credit_statement_date?: string | null
  credit_due_date?: string | null
  created_at: string
  personal_obligations?: PersonalObligation[]
}

export interface Budget {
  id: string
  user_id: string
  category: string
  item?: string
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
  obligation_type?: 'normal' | 'owe_me' | 'i_owe'
  contact_id?: string | null
  contact_user_id?: string | null
  contact_name?: string
  contact_email?: string | null
}

export interface BudgetFormData {
  category: string
  item?: string
  amount: number
  month: number
  year: number
}

export type WishlistPriority = 'high' | 'medium' | 'low'
export type WishlistStatus = 'wishlist' | 'budgeted' | 'purchased' | 'cancelled'

export interface WishlistItem {
  id: string
  user_id: string
  name: string
  target_amount: number
  category: string
  priority: WishlistPriority | null
  notes: string
  product_url: string | null
  quantity: number
  status: WishlistStatus
  linked_budget_id: string | null
  created_at: string
  updated_at: string
  budgets?: Budget | null
}

export interface WishlistFormData {
  name: string
  target_amount: number
  category: string
  priority?: WishlistPriority | null
  notes?: string
  product_url?: string | null
  quantity?: number
}

export type WishlistShareMode = 'single' | 'multiple' | 'entire'

export interface WishlistShare {
  id: string
  owner_user_id: string
  recipient_user_id: string
  contact_id: string | null
  mode: WishlistShareMode
  share_notes: boolean
  share_product_links: boolean
  share_prices: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  contacts?: Contact | null
  wishlist_share_items?: Array<{ wishlist_item_id: string }>
}

export interface SharedWishlistItem {
  share_id: string
  owner_user_id: string
  owner_name: string
  mode: WishlistShareMode
  item_id: string
  name: string
  target_amount: number | null
  category: string
  priority: WishlistPriority | null
  notes: string
  product_url: string | null
  quantity: number
  status: WishlistStatus
  share_notes: boolean
  share_product_links: boolean
  share_prices: boolean
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

export interface CreditCardPayment {
  id: string
  user_id: string
  credit_card_account_id: string
  source_account_id: string
  transfer_id: string | null
  amount: number
  remaining_outstanding_after_payment: number
  paid_at: string
  created_at: string
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
