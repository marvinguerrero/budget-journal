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
  current_statement_date?: string | null
  current_due_date?: string | null
  /** ISO 4217-style code, e.g. 'PHP', 'JPY', 'USD'. Defaults to 'PHP'. */
  currency_code: string
  /** Always 'PHP' today; stored per-account for future multi-base-currency support. */
  base_currency_code: string
  /** Native-currency running balance. Only populated when currency_code !== base_currency_code. */
  foreign_balance?: number | null
  /** PHP cost-basis running balance for foreign accounts; mirrors `balance`. */
  base_cost_balance?: number | null
  /** Weighted-average PHP cost per 1 unit of foreign currency. Updates only on funding transfers. */
  average_exchange_rate?: number | null
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
  currency_code?: string
}

export type SharedFinancialAccountPermissionLevel = 'viewer' | 'contributor' | 'manager'
export type SharedFinancialAccountStatus = 'active' | 'removed'

export interface SharedFinancialAccount {
  id: string
  account_id: string
  owner_user_id: string
  shared_with_user_id: string
  contact_id: string | null
  permission_level: SharedFinancialAccountPermissionLevel
  can_view_balance: boolean
  can_view_expenses: boolean
  can_view_receipts: boolean
  can_view_itemization: boolean
  can_add_expense: boolean
  can_edit_own_expense: boolean
  can_manage_sharing: boolean
  status: SharedFinancialAccountStatus
  created_at: string
  updated_at: string
  contacts?: Contact | null
}

export interface SharedFinancialAccountSummary {
  share_id: string
  account_id: string
  owner_user_id: string
  owner_email: string | null
  account_name: string
  account_emoji: string
  account_color: string
  account_type: AccountType
  account_category: AccountCategory
  balance: number | null
  currency_code: string
  base_currency_code: string
  permission_level: SharedFinancialAccountPermissionLevel
  can_view_balance: boolean
  can_view_expenses: boolean
  can_view_receipts: boolean
  can_view_itemization: boolean
  can_add_expense: boolean
  can_edit_own_expense: boolean
  can_manage_sharing: boolean
  status: SharedFinancialAccountStatus
}

export interface SharedFinancialAccountShareForm {
  account_id: string
  contact_id: string
  permission_level: SharedFinancialAccountPermissionLevel
  can_view_balance: boolean
  can_view_expenses: boolean
  can_view_receipts: boolean
  can_view_itemization: boolean
  can_add_expense: boolean
  can_edit_own_expense: boolean
  can_manage_sharing: boolean
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
    | 'loan_request'
    | 'loan_request_approved'
    | 'loan_request_rejected'
    | 'credit_card_due'
    | 'credit_card_config'
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
  /** Set when this obligation was generated from a receipt line item rather than the whole expense. */
  source_line_item_id?: string | null
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
  expense_id?: string | null
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
  owner_user_id?: string | null
  created_by_user_id?: string | null
  amount: number
  category: string
  note: string
  account_id?: string | null
  shared_account_id?: string | null
  shared_expense_id?: string | null
  shared_group_id?: string | null
  shared_budget_id?: string | null
  shared_budget_item?: string | null
  is_shared_budget_expense?: boolean
  credit_billing_cycle_start?: string | null
  credit_billing_cycle_end?: string | null
  credit_statement_date?: string | null
  credit_due_date?: string | null
  receipt_path?: string | null
  has_receipt?: boolean
  /** Native-currency amount as entered, when account_id points to a foreign-currency account. */
  original_amount?: number | null
  /** Currency code of original_amount, e.g. 'JPY'. Null for base-currency (PHP) expenses. */
  original_currency?: string | null
  /** PHP equivalent of original_amount. Mirrors `amount` when original_currency is set. */
  converted_amount?: number | null
  /** The account's average_exchange_rate at the moment this expense was posted. */
  exchange_rate_used?: number | null
  created_at: string
  updated_at?: string | null
  personal_obligations?: PersonalObligation[]
  expense_participants?: ExpenseParticipant[]
}

export type ExpenseParticipantKind = 'self' | 'contact' | 'external'
export type ExpenseSplitMode = 'equal' | 'custom'

export interface ExpenseParticipant {
  id: string
  expense_id: string
  user_id: string
  participant_kind: ExpenseParticipantKind
  contact_id: string | null
  contact_user_id: string | null
  participant_name: string
  participant_email: string | null
  participant_phone?: string | null
  share_amount: number
  is_payer: boolean
  obligation_id: string | null
  /** Set when this participant row belongs to a "Shared" line item split rather than the whole expense. */
  line_item_id?: string | null
  created_at: string
  personal_obligations?: PersonalObligation | null
}

export interface ExpenseParticipantFormData {
  participant_kind: ExpenseParticipantKind
  contact_id?: string | null
  contact_user_id?: string | null
  participant_name: string
  participant_email?: string | null
  participant_phone?: string | null
  share_amount: number
  is_payer?: boolean
}

export interface ExpenseSharedBudgetDetails {
  group_name: string
  category: string
  item: string
  budget_amount: number
  actual_spent: number
  remaining_budget: number
}

export interface ExpenseDetailsData {
  expense: Expense
  account: FinancialAccount | null
  sharedBudget: ExpenseSharedBudgetDetails | null
  obligation: PersonalObligation | null
  obligations: PersonalObligation[]
  settlements: PersonalObligationSettlement[]
  participants: ExpenseParticipant[]
}

/** @deprecated superseded by derived_status, computed from owner/payer/shouldered_by. Kept for legacy rows. */
export type LineItemAssignedType = 'personal' | 'owe_me' | 'i_owe' | 'shared'

/** Auto-derived from comparing owner/payer/shouldered_by — see migration_063. */
export type LineItemDerivedStatus = 'personal' | 'receivable' | 'payable' | 'gift' | 'shared'

export type PersonRefKind = 'self' | 'contact' | 'external'

/** A reference to a person in one of the three ownership roles (owner/payer/shouldered_by). */
export interface PersonRef {
  kind: PersonRefKind
  contact_id?: string | null
  name?: string | null
  email?: string | null
}

export interface ExpenseLineItem {
  id: string
  expense_id: string
  user_id: string
  description: string
  category: string | null
  /** Native-currency amount as entered, e.g. ¥2,000. */
  original_amount: number
  /** Defaults from the parent expense's original_currency. */
  original_currency: string
  /** Always server-computed: original_amount × exchange_rate_used. Never client-trusted. */
  converted_amount: number
  /** Always 'PHP' today. */
  base_currency: string
  /** Defaults from the parent expense's exchange_rate_used. */
  exchange_rate_used: number
  /** @deprecated superseded by derived_status. */
  assigned_type: LineItemAssignedType
  /** @deprecated superseded by owner/payer/shouldered_by contact ids. */
  assigned_contact_id: string | null

  // Owner: who ultimately owns/uses/consumes the item.
  owner_kind: PersonRefKind
  owner_contact_id: string | null
  owner_name: string | null
  owner_email: string | null

  // Payer: who is responsible for paying for the item.
  payer_kind: PersonRefKind
  payer_contact_id: string | null
  payer_name: string | null
  payer_email: string | null

  // Shouldered by: who initially fronted the money for the item.
  shouldered_by_kind: PersonRefKind
  shouldered_by_contact_id: string | null
  shouldered_by_name: string | null
  shouldered_by_email: string | null

  /** Server-computed from owner/payer/shouldered_by — see migration_063. */
  derived_status: LineItemDerivedStatus

  /** Set for receivable/payable line items — the generated personal_obligations row. */
  obligation_id: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface ExpenseLineItemFormData {
  description: string
  category?: string | null
  /** Native-currency amount as entered, e.g. 2000 for ¥2,000. */
  original_amount: number
  notes?: string

  /** When true, ignore owner/payer/shouldered_by and use the participants split below instead. */
  is_shared_split: boolean
  owner?: PersonRef
  payer?: PersonRef
  shouldered_by?: PersonRef

  // Used only when is_shared_split is true.
  split_mode?: ExpenseSplitMode
  participants?: ExpenseParticipantFormData[]
}

export interface LineItemAllocation {
  nativeTotal: number
  allocated: number
  unallocated: number
  isFullyAllocated: boolean
  percentAllocated: number
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
  shared_account_id?: string | null
  created_at?: string
  obligation_type?: 'normal' | 'owe_me' | 'i_owe'
  contact_id?: string | null
  contact_user_id?: string | null
  contact_name?: string
  contact_email?: string | null
  receipt_file?: File | null
  remove_receipt?: boolean
  receipt_path?: string | null
  has_receipt?: boolean
  split_mode?: ExpenseSplitMode
  participants?: ExpenseParticipantFormData[]
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
  created_at: string
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
  transfer_fee: number
  fee_expense_id: string | null
  note: string
  transferred_at: string
  created_at: string
  /** Native foreign-currency amount received. Only set for currency exchange transfers. */
  destination_amount?: number | null
  source_currency?: string | null
  destination_currency?: string | null
  /** PHP cost per 1 unit of destination currency for this specific exchange (amount / destination_amount). */
  exchange_rate?: number | null
}

export interface AccountTransferFormData {
  from_account_id: string
  to_account_id: string
  amount: number
  transfer_fee?: number
  note: string
  transferred_at: string
  /** Set this to perform a currency exchange transfer (from must be base-currency, to must be foreign). */
  destination_amount?: number | null
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

export type LoanType = 'money_lent' | 'money_borrowed'
export type LoanStatus = 'draft' | 'active' | 'cancelled' | 'fully_paid'
export type LoanCounterpartyKind = 'registered_user' | 'contact' | 'external'
export type LoanFeeResponsibility = 'lender' | 'borrower'
export type LoanRequestStatus = 'pending_approval' | 'approved' | 'rejected' | 'cancelled'

export interface Loan {
  id: string
  user_id: string
  loan_type: LoanType
  counterparty_kind: LoanCounterpartyKind
  person_name: string
  person_email: string | null
  person_phone: string | null
  contact_id: string | null
  contact_user_id: string | null
  account_id: string | null
  principal_amount: number
  transfer_fee: number
  fee_responsibility: LoanFeeResponsibility
  fee_expense_id: string | null
  loan_request_id?: string | null
  counterparty_loan_id?: string | null
  amount: number
  paid_amount: number
  remaining_amount: number
  status: LoanStatus
  loan_date: string
  due_date: string | null
  notes: string
  interest_rate: number | null
  payment_schedule: string | null
  created_at: string
  updated_at: string
}

export interface LoanPayment {
  id: string
  loan_id: string
  user_id: string
  account_id: string | null
  amount: number
  paid_at: string
  note: string
  created_at: string
}

export interface LoanRequest {
  id: string
  borrower_user_id: string
  lender_user_id: string
  borrower_account_id: string | null
  lender_account_id: string | null
  borrower_name: string
  borrower_email: string | null
  lender_name: string
  lender_email: string | null
  amount: number
  principal_amount: number
  transfer_fee: number
  fee_responsibility: LoanFeeResponsibility
  due_date: string | null
  notes: string
  status: LoanRequestStatus
  borrower_loan_id: string | null
  lender_loan_id: string | null
  requested_at: string
  responded_at: string | null
  created_at: string
  updated_at: string
}

export interface LoanFormData {
  loan_type: LoanType
  counterparty_kind: LoanCounterpartyKind
  person_name: string
  person_email?: string | null
  person_phone?: string | null
  contact_id?: string | null
  contact_user_id?: string | null
  amount: number
  transfer_fee?: number
  fee_responsibility?: LoanFeeResponsibility
  account_id: string
  loan_date: string
  due_date?: string | null
  notes?: string
}

export interface LoanPaymentFormData {
  loan_id: string
  amount: number
  account_id: string
  paid_at?: string
  note?: string
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
