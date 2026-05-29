import { SharedExpense, SharedExpenseSplit, SharedExpenseSettlement } from '@/types'

export interface GroupNetBalance {
  debtorId: string
  debtorEmail: string
  creditorId: string
  creditorEmail: string
  amount: number
}

/** Computes net balances for one shared group, subtracting confirmed settlements. */
export function computeGroupNetBalances(
  expenses: SharedExpense[],
  splits: SharedExpenseSplit[],
  settlements: SharedExpenseSettlement[],
): GroupNetBalance[] {
  const splitsByExpense = new Map<string, SharedExpenseSplit[]>()
  for (const s of splits) {
    const arr = splitsByExpense.get(s.expense_id) ?? []
    arr.push(s)
    splitsByExpense.set(s.expense_id, arr)
  }

  const net: Record<string, Record<string, number>> = {}
  const emailFor: Record<string, string> = {}

  for (const exp of expenses) {
    const creditorId    = exp.paid_by_user_id ?? exp.user_id
    const creditorEmail = exp.paid_by_email   || exp.user_email
    emailFor[creditorId] = creditorEmail

    for (const s of splitsByExpense.get(exp.id) ?? []) {
      if (s.debtor_user_id === creditorId) continue
      emailFor[s.debtor_user_id] = s.debtor_email
      if (!net[s.debtor_user_id]) net[s.debtor_user_id] = {}
      net[s.debtor_user_id][creditorId] = (net[s.debtor_user_id][creditorId] ?? 0) + s.amount
    }
  }

  for (const st of settlements) {
    if (st.status !== 'confirmed') continue
    const d = st.payer_user_id
    const c = st.receiver_user_id
    if (net[d]?.[c] !== undefined) {
      net[d][c] = Math.max(0, net[d][c] - st.amount)
    }
  }

  const result: GroupNetBalance[] = []
  const done = new Set<string>()

  for (const debtorId of Object.keys(net)) {
    for (const creditorId of Object.keys(net[debtorId])) {
      const key = [debtorId, creditorId].sort().join('|')
      if (done.has(key)) continue
      done.add(key)

      const aOwesB = net[debtorId]?.[creditorId] ?? 0
      const bOwesA = net[creditorId]?.[debtorId] ?? 0
      const netAmt = aOwesB - bOwesA

      if (netAmt > 0.005) {
        result.push({ debtorId, debtorEmail: emailFor[debtorId], creditorId, creditorEmail: emailFor[creditorId], amount: netAmt })
      } else if (netAmt < -0.005) {
        result.push({ debtorId: creditorId, debtorEmail: emailFor[creditorId], creditorId: debtorId, creditorEmail: emailFor[debtorId], amount: -netAmt })
      }
    }
  }

  return result.sort((a, b) => b.amount - a.amount)
}
