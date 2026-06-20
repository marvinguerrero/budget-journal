import { createClient } from '@/lib/supabase/client'
import {
  Expense,
  SharedFinancialAccount,
  SharedFinancialAccountShareForm,
  SharedFinancialAccountSummary,
} from '@/types'

const SHARED_ACCESS_SELECT = `
  id,
  account_id,
  owner_user_id,
  shared_with_user_id,
  contact_id,
  permission_level,
  can_view_balance,
  can_view_expenses,
  can_view_receipts,
  can_view_itemization,
  can_add_expense,
  can_edit_own_expense,
  can_manage_sharing,
  status,
  created_at,
  updated_at,
  contacts(id, user_id, name, email, phone, notes, contact_type, link_status, linked_user_id, created_at, updated_at)
`

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

function normalizeShare(row: SharedFinancialAccount): SharedFinancialAccount {
  return {
    ...row,
    contacts: firstRelation(row.contacts),
  }
}

export async function getSharedAccessForAccount(accountId: string): Promise<SharedFinancialAccount[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shared_financial_accounts')
    .select(SHARED_ACCESS_SELECT)
    .eq('account_id', accountId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as unknown as SharedFinancialAccount[]).map(normalizeShare)
}

export async function getSharedFinancialAccountsWithMe(): Promise<SharedFinancialAccountSummary[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_shared_financial_accounts_with_me')
  if (error) throw new Error(error.message)
  return (data ?? []) as SharedFinancialAccountSummary[]
}

export async function getSharedFinancialAccountSummary(accountId: string): Promise<SharedFinancialAccountSummary | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_shared_financial_account_summary', {
    p_account_id: accountId,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as SharedFinancialAccountSummary[])[0] ?? null
}

export async function shareFinancialAccount(form: SharedFinancialAccountShareForm): Promise<SharedFinancialAccount> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('share_financial_account', {
    p_account_id: form.account_id,
    p_contact_id: form.contact_id,
    p_permission_level: form.permission_level,
    p_can_view_balance: form.can_view_balance,
    p_can_view_expenses: form.can_view_expenses,
    p_can_view_receipts: form.can_view_receipts,
    p_can_view_itemization: form.can_view_itemization,
    p_can_add_expense: form.can_add_expense,
    p_can_edit_own_expense: form.can_edit_own_expense,
    p_can_manage_sharing: form.can_manage_sharing,
  })
  if (error) throw new Error(error.message)
  return normalizeShare(data as SharedFinancialAccount)
}

export async function removeSharedFinancialAccountAccess(shareId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('remove_shared_financial_account_access', {
    p_share_id: shareId,
  })
  if (error) throw new Error(error.message)
}

export async function createSharedAccountExpense(payload: {
  sharedAccountId: string
  amount: number
  category: string
  note?: string
  createdAt?: string
}): Promise<Expense> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('create_shared_account_expense', {
    p_shared_account_id: payload.sharedAccountId,
    p_amount: payload.amount,
    p_category: payload.category,
    p_note: payload.note ?? '',
    p_created_at: payload.createdAt ?? new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return data as Expense
}
