'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FinancialAccount } from '@/types'
import { toast } from 'sonner'

export type ActivityEntry =
  | {
      kind: 'expense'
      id: string
      date: string
      amount: number
      category: string
      note: string
      account: FinancialAccount
    }
  | {
      kind: 'income'
      id: string
      date: string
      amount: number
      sourceName: string
      sourceEmoji: string
      note: string
      account: FinancialAccount
    }
  | {
      kind: 'transfer'
      id: string
      date: string
      amount: number
      note: string
      fromAccount: FinancialAccount
      toAccount: FinancialAccount
    }

export function useAccountActivity(month?: number, year?: number) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()

      const { data: accountRows } = await supabase.from('financial_accounts').select('*')
      const accMap = new Map<string, FinancialAccount>(
        (accountRows ?? []).map((a: FinancialAccount) => [a.id, a])
      )

      let start: string | null = null
      let end: string | null = null
      if (month && year) {
        start = new Date(year, month - 1, 1).toISOString()
        end   = new Date(year, month, 0, 23, 59, 59).toISOString()
      } else if (year) {
        start = new Date(year, 0, 1).toISOString()
        end   = new Date(year, 11, 31, 23, 59, 59).toISOString()
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withDates = (q: any, field: string) =>
        start && end ? q.gte(field, start).lte(field, end) : q

      const [
        { data: expenses,  error: expErr },
        { data: incomes,   error: incErr },
        { data: transfers, error: tfrErr },
      ] = await Promise.all([
        withDates(
          supabase.from('expenses').select('*').not('account_id', 'is', null),
          'created_at',
        ),
        withDates(
          supabase
            .from('income_entries')
            .select('*, income_sources(name, emoji)')
            .not('account_id', 'is', null),
          'received_at',
        ),
        withDates(
          supabase.from('account_transfers').select('*'),
          'transferred_at',
        ),
      ])

      if (expErr) throw expErr
      if (incErr) throw incErr
      if (tfrErr) throw tfrErr

      const result: ActivityEntry[] = []

      for (const e of expenses ?? []) {
        const account = accMap.get(e.account_id)
        if (!account) continue
        result.push({ kind: 'expense', id: e.id, date: e.created_at, amount: e.amount, category: e.category, note: e.note, account })
      }

      for (const i of incomes ?? []) {
        const account = accMap.get(i.account_id)
        if (!account) continue
        const src = i.income_sources as { name: string; emoji: string } | null
        result.push({
          kind: 'income',
          id: i.id,
          date: i.received_at,
          amount: i.amount,
          sourceName: src?.name ?? 'Income',
          sourceEmoji: src?.emoji ?? '💰',
          note: i.note,
          account,
        })
      }

      for (const t of transfers ?? []) {
        const fromAccount = accMap.get(t.from_account_id)
        const toAccount   = accMap.get(t.to_account_id)
        if (!fromAccount || !toAccount) continue
        result.push({ kind: 'transfer', id: t.id, date: t.transferred_at, amount: t.amount, note: t.note, fromAccount, toAccount })
      }

      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setEntries(result)
    } catch {
      toast.error('Failed to load activity')
    } finally {
      setIsLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  return { entries, isLoading, reload: load }
}
