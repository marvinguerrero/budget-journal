import { createClient } from '@/lib/supabase/client'
import { SharedGroup, SharedGroupMember, SharedBudget, SharedExpense, SharedExpenseSplit, PermissionRequest } from '@/types'

export async function getMySharedGroups(): Promise<SharedGroup[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shared_groups')
    .select('*')
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
  requests: PermissionRequest[]
}> {
  const supabase = createClient()
  const [groupRes, membersRes, budgetsRes, expensesRes, requestsRes] = await Promise.all([
    supabase.from('shared_groups').select('*').eq('id', id).single(),
    supabase.from('shared_group_members').select('*').eq('group_id', id).order('created_at'),
    supabase.from('shared_budgets').select('*').eq('group_id', id).order('created_at'),
    supabase.from('shared_expenses').select('*').eq('group_id', id).order('created_at', { ascending: false }),
    supabase.from('permission_requests').select('*').eq('group_id', id).eq('status', 'pending').order('created_at'),
  ])
  if (groupRes.error) throw groupRes.error

  const ownerRes = await supabase
    .from('profiles')
    .select('email')
    .eq('id', groupRes.data.owner_id)
    .single()

  const expenseIds = (expensesRes.data ?? []).map((e) => e.id)
  const splitsRes = expenseIds.length > 0
    ? await supabase.from('shared_expense_splits').select('*').in('expense_id', expenseIds)
    : { data: [] as SharedExpenseSplit[], error: null }

  return {
    group: groupRes.data,
    ownerEmail: ownerRes.data?.email ?? '',
    members: membersRes.data || [],
    budgets: budgetsRes.data || [],
    expenses: expensesRes.data || [],
    splits: splitsRes.data || [],
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
