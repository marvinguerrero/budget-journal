import { createClient } from '@/lib/supabase/client'
import {
  SharedGroup, SharedGroupMember, SharedExpense,
  SharedExpenseSplit, SharedExpenseSettlement,
} from '@/types'
import { getMySharedGroups } from './sharedGroups'

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
        supabase.from('shared_group_members').select('*').eq('group_id', group.id),
        supabase.from('shared_expenses').select('*').eq('group_id', group.id).order('created_at', { ascending: false }),
        supabase.from('shared_expense_settlements').select('*').eq('group_id', group.id).order('created_at', { ascending: false }),
        supabase.from('profiles').select('email').eq('id', group.owner_id).single(),
      ])

      const expenseIds = (expensesRes.data ?? []).map((e) => e.id)
      const splitsRes  = expenseIds.length > 0
        ? await supabase.from('shared_expense_splits').select('*').in('expense_id', expenseIds)
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
