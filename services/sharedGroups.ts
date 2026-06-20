import { createClient } from '@/lib/supabase/client'
import { SharedGroup, SharedGroupMember, SharedBudget, SharedExpense, SharedExpenseSplit, SharedExpenseSettlement, PermissionRequest } from '@/types'
import { QUERY_LIMITS } from '@/lib/queryLimits'

const SHARED_GROUP_SELECT = 'id, name, emoji, owner_id, created_at'
const SHARED_MEMBER_SELECT = 'id, group_id, user_id, email, can_edit_budget, can_invite_members, created_at'
const SHARED_BUDGET_SELECT = 'id, group_id, category, item, amount, created_at'
const SHARED_EXPENSE_SELECT = 'id, group_id, shared_budget_id, expense_id, user_id, user_email, category, amount, note, paid_by_user_id, paid_by_email, split_mode, account_id, payment_source_status, created_at'
const SHARED_SPLIT_SELECT = 'id, expense_id, debtor_user_id, debtor_email, amount, created_at'
const SHARED_SETTLEMENT_SELECT = 'id, group_id, payer_user_id, payer_email, receiver_user_id, receiver_email, amount, payer_account_id, receiver_account_id, expense_id, income_entry_id, status, note, created_at, confirmed_at, confirmed_by_user_id, payer_account_label, receiver_account_label'
const PERMISSION_REQUEST_SELECT = 'id, group_id, user_id, user_email, type, status, created_at'

export async function getMySharedGroups(): Promise<SharedGroup[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shared_groups')
    .select(SHARED_GROUP_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getSharedGroupDetails(id: string): Promise<{
  group: SharedGroup
  ownerEmail: string
  members: SharedGroupMember[]
  budgets: SharedBudget[]
  expenses: SharedExpense[]
  splits: SharedExpenseSplit[]
  settlements: SharedExpenseSettlement[]
  requests: PermissionRequest[]
}> {
  const supabase = createClient()
  const [groupRes, membersRes, budgetsRes, expensesRes, requestsRes, settlementsRes] = await Promise.all([
    supabase.from('shared_groups').select(SHARED_GROUP_SELECT).eq('id', id).single(),
    supabase.from('shared_group_members').select(SHARED_MEMBER_SELECT).eq('group_id', id).order('created_at'),
    supabase.from('shared_budgets').select(SHARED_BUDGET_SELECT).eq('group_id', id).order('created_at'),
    supabase.from('shared_expenses').select(SHARED_EXPENSE_SELECT).eq('group_id', id).order('created_at', { ascending: false }).limit(QUERY_LIMITS.sharedExpenses),
    supabase.from('permission_requests').select(PERMISSION_REQUEST_SELECT).eq('group_id', id).eq('status', 'pending').order('created_at'),
    supabase.from('shared_expense_settlements').select(SHARED_SETTLEMENT_SELECT).eq('group_id', id).order('created_at', { ascending: false }).limit(QUERY_LIMITS.settlements),
  ])
  if (groupRes.error) throw groupRes.error

  const ownerRes = await supabase
    .from('profiles')
    .select('email')
    .eq('id', groupRes.data.owner_id)
    .single()

  const expenseIds = (expensesRes.data ?? []).map((e) => e.id)
  const splitsRes = expenseIds.length > 0
    ? await supabase.from('shared_expense_splits').select(SHARED_SPLIT_SELECT).in('expense_id', expenseIds)
    : { data: [] as SharedExpenseSplit[], error: null }

  return {
    group: groupRes.data,
    ownerEmail: ownerRes.data?.email ?? '',
    members: membersRes.data || [],
    budgets: budgetsRes.data || [],
    expenses: expensesRes.data || [],
    splits: splitsRes.data || [],
    settlements: settlementsRes.data || [],
    requests: requestsRes.data || [],
  }
}

export async function createSharedGroup(name: string, emoji: string): Promise<SharedGroup> {
  const supabase = createClient()
  const { data, error } = await supabase
    .rpc('create_shared_group', { p_name: name.trim(), p_emoji: emoji })
  if (error) throw error
  return data as SharedGroup
}

export async function deleteSharedGroup(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('shared_groups').delete().eq('id', id)
  if (error) throw error
}

export async function inviteMember(
  groupId: string,
  email: string,
  canEditBudget = false,
  canInviteMembers = false
): Promise<SharedGroupMember> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('invite_group_member', {
    p_group_id: groupId,
    p_email: email.toLowerCase().trim(),
    p_can_edit_budget: canEditBudget,
    p_can_invite_members: canInviteMembers,
  })
  if (error) throw new Error(error.message)
  return data as SharedGroupMember
}

export async function updateMemberPermissions(
  memberId: string,
  canEditBudget: boolean,
  canInviteMembers: boolean
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('update_member_permissions', {
    p_member_id: memberId,
    p_can_edit_budget: canEditBudget,
    p_can_invite_members: canInviteMembers,
  })
  if (error) throw new Error(error.message)
}

export async function removeMember(memberId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('shared_group_members').delete().eq('id', memberId)
  if (error) throw error
}

export async function leaveGroup(groupId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('shared_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', user.id)
  if (error) throw error
}
