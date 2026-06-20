import { createClient } from '@/lib/supabase/client'
import {
  SharedGroup, SharedGroupMember, SharedExpense,
  SharedExpenseSplit, SharedExpenseSettlement,
} from '@/types'
import { getMySharedGroups } from './sharedGroups'
import { QUERY_LIMITS } from '@/lib/queryLimits'

const BALANCE_MEMBER_SELECT = 'id, group_id, user_id, email, can_edit_budget, can_invite_members, created_at'
const BALANCE_EXPENSE_SELECT = 'id, group_id, shared_budget_id, expense_id, user_id, user_email, category, amount, note, paid_by_user_id, paid_by_email, split_mode, account_id, payment_source_status, created_at'
const BALANCE_SPLIT_SELECT = 'id, expense_id, debtor_user_id, debtor_email, amount, created_at'
const BALANCE_SETTLEMENT_SELECT = 'id, group_id, payer_user_id, payer_email, receiver_user_id, receiver_email, amount, payer_account_id, receiver_account_id, expense_id, income_entry_id, status, note, created_at, confirmed_at, confirmed_by_user_id, payer_account_label, receiver_account_label'

export interface GroupBalanceData {
  group: SharedGroup
  ownerEmail: string
  members: SharedGroupMember[]
  expenses: SharedExpense[]
  splits: SharedExpenseSplit[]
  settlements: SharedExpenseSettlement[]
}

export async function getBalancesData(): Promise<GroupBalanceData[]> {
  const groups = await getMySharedGroups()
  if (groups.length === 0) return []

  const supabase = createClient()

  const results = await Promise.all(
    groups.map(async (group) => {
      const [membersRes, expensesRes, settlementsRes, ownerRes] = await Promise.all([
        supabase.from('shared_group_members').select(BALANCE_MEMBER_SELECT).eq('group_id', group.id),
        supabase.from('shared_expenses').select(BALANCE_EXPENSE_SELECT).eq('group_id', group.id).order('created_at', { ascending: false }).limit(QUERY_LIMITS.sharedExpenses),
        supabase.from('shared_expense_settlements').select(BALANCE_SETTLEMENT_SELECT).eq('group_id', group.id).order('created_at', { ascending: false }).limit(QUERY_LIMITS.settlements),
        supabase.from('profiles').select('email').eq('id', group.owner_id).single(),
      ])

      const expenseIds = (expensesRes.data ?? []).map((e) => e.id)
      const splitsRes  = expenseIds.length > 0
        ? await supabase.from('shared_expense_splits').select(BALANCE_SPLIT_SELECT).in('expense_id', expenseIds)
        : { data: [] as SharedExpenseSplit[] }

      return {
        group,
        ownerEmail:  ownerRes.data?.email ?? '',
        members:     membersRes.data ?? [],
        expenses:    expensesRes.data ?? [],
        splits:      splitsRes.data   ?? [],
        settlements: settlementsRes.data ?? [],
      }
    })
  )

  return results
}
