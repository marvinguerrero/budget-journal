'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FinancialAccount } from '@/types'
import { toast } from 'sonner'

export type AccountDetailEntry =
  | {
      kind: 'expense'
      id: string
      date: string
      amount: number
      category: string
      note: string
    }
  | {
      kind: 'shared_expense'
      id: string
      date: string
      amount: number
      category: string
      note: string
      groupName: string
      groupEmoji: string
    }
  | {
      kind: 'income'
      id: string
      date: string
      amount: number
      sourceName: string
      sourceEmoji: string
      note: string
    }
  | {
      kind: 'transfer'
      id: string
      date: string
      amount: number
      note: string
      direction: 'in' | 'out'
      otherAccount: FinancialAccount
    }

export function useAccountDetail(accountId: string) {
  const [account, setAccount] = useState<FinancialAccount | null>(null)
  const [entries, setEntries] = useState<AccountDetailEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    if (!accountId) return
    setIsLoading(true)
    try {
      const supabase = createClient()

      const [
        { data: acc,            error: accErr },
        { data: allAccounts },
        { data: expenses,       error: expErr },
        { data: sharedExpenses, error: seErr },
        { data: incomes,        error: incErr },
        { data: transfersOut,   error: tfoErr },
        { data: transfersIn,    error: tfiErr },
      ] = await Promise.all([
        supabase.from('financial_accounts').select('*').eq('id', accountId).single(),
        supabase.from('financial_accounts').select('*'),
        supabase.from('expenses').select('*').eq('account_id', accountId),
        supabase
          .from('shared_expenses')
          .select('*, shared_groups(name, emoji)')
          .eq('account_id', accountId),
        supabase
          .from('income_entries')
          .select('*, income_sources(name, emoji)')
          .eq('account_id', accountId)
          .eq('status', 'received'),
        supabase.from('account_transfers').select('*').eq('from_account_id', accountId),
        supabase.from('account_transfers').select('*').eq('to_account_id', accountId),
      ])

      if (accErr) throw accErr
      if (expErr) throw expErr
      if (seErr)  throw seErr
      if (incErr) throw incErr
      if (tfoErr) throw tfoErr
      if (tfiErr) throw tfiErr

      setAccount(acc)

      const accMap = new Map<string, FinancialAccount>(
        (allAccounts ?? []).map((a: FinancialAccount) => [a.id, a])
      )

      const result: AccountDetailEntry[] = []

      for (const e of expenses ?? []) {
        result.push({ kind: 'expense', id: e.id, date: e.created_at, amount: e.amount, category: e.category, note: e.note })
      }

      for (const se of sharedExpenses ?? []) {
        const grp = se.shared_groups as { name: string; emoji: string } | null
        result.push({
          kind: 'shared_expense',
          id: se.id,
          date: se.created_at,
          amount: se.amount,
          category: se.category,
          note: se.note,
          groupName: grp?.name ?? 'Shared Group',
          groupEmoji: grp?.emoji ?? '👥',
        })
      }

      for (const i of incomes ?? []) {
        const src = i.income_sources as { name: string; emoji: string } | null
        result.push({
          kind: 'income',
          id: i.id,
          date: i.received_at,
          amount: i.amount,
          sourceName: src?.name ?? 'Income',
          sourceEmoji: src?.emoji ?? '💰',
          note: i.note,
        })
      }

      for (const t of transfersOut ?? []) {
        const otherAccount = accMap.get(t.to_account_id)
        if (!otherAccount) continue
        result.push({ kind: 'transfer', id: t.id, date: t.transferred_at, amount: t.amount, note: t.note, direction: 'out', otherAccount })
      }

      for (const t of transfersIn ?? []) {
        const otherAccount = accMap.get(t.from_account_id)
        if (!otherAccount) continue
        result.push({ kind: 'transfer', id: t.id, date: t.transferred_at, amount: t.amount, note: t.note, direction: 'in', otherAccount })
      }

      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setEntries(result)
    } catch {
      toast.error('Failed to load account details')
    } finally {
      setIsLoading(false)
    }
  }, [accountId])

  useEffect(() => { load() }, [load])

  const moneyIn = useMemo(() =>
    entries.reduce((s, e) =>
      (e.kind === 'income' || (e.kind === 'transfer' && e.direction === 'in')) ? s + e.amount : s, 0),
    [entries]
  )

  const moneyOut = useMemo(() =>
    entries.reduce((s, e) =>
      (e.kind === 'expense' || e.kind === 'shared_expense' || (e.kind === 'transfer' && e.direction === 'out')) ? s + e.amount : s, 0),
    [entries]
  )

  return { account, entries, isLoading, moneyIn, moneyOut, reload: load }
}
