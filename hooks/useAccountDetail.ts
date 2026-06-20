'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FinancialAccount, SharedFinancialAccountSummary } from '@/types'
import { toast } from 'sonner'
import { QUERY_LIMITS } from '@/lib/queryLimits'
import { getSharedFinancialAccountSummary } from '@/services/sharedFinancialAccounts'

const DETAIL_ACCOUNT_SELECT = `
  id,
  user_id,
  name,
  emoji,
  color,
  type,
  category,
  balance,
  credit_limit,
  soa_day,
  due_day,
  last_statement_date,
  current_statement_date,
  current_due_date,
  currency_code,
  base_currency_code,
  foreign_balance,
  base_cost_balance,
  average_exchange_rate,
  created_at
`

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

function profileLabel(email?: string | null) {
  if (!email) return 'Budget Journal user'
  return email.split('@')[0] || email
}

export type AccountDetailEntry =
  | {
      kind: 'expense'
      id: string
      date: string
      amount: number
      category: string
      note: string
      ownerUserId?: string | null
      createdByUserId?: string | null
      ownerLabel?: string
      createdByLabel?: string
      hasReceipt?: boolean
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
      transferFee: number
      note: string
      direction: 'in' | 'out'
      otherAccount: FinancialAccount
    }
  | {
      kind: 'personal_settlement'
      id: string
      date: string
      amount: number
      note: string
      direction: 'in' | 'out'
      contactName: string
      status: 'pending_confirmation' | 'confirmed'
    }

export function useAccountDetail(accountId: string) {
  const [account, setAccount] = useState<FinancialAccount | null>(null)
  const [sharedAccess, setSharedAccess] = useState<SharedFinancialAccountSummary | null>(null)
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
        { data: personalPaid,   error: pspErr },
        { data: personalRecv,   error: psrErr },
      ] = await Promise.all([
        supabase.from('financial_accounts').select(DETAIL_ACCOUNT_SELECT).eq('id', accountId).maybeSingle(),
        supabase.from('financial_accounts').select(DETAIL_ACCOUNT_SELECT),
        supabase
          .from('expenses')
          .select('id, created_at, amount, category, note, owner_user_id, created_by_user_id, has_receipt')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(QUERY_LIMITS.accountActivity),
        supabase
          .from('shared_expenses')
          .select('id, created_at, amount, category, note, shared_groups(name, emoji)')
          .eq('account_id', accountId)
          .is('expense_id', null)
          .order('created_at', { ascending: false })
          .limit(QUERY_LIMITS.accountActivity),
        supabase
          .from('income_entries')
          .select('id, received_at, amount, note, income_sources(name, emoji)')
          .eq('account_id', accountId)
          .eq('status', 'received')
          .order('received_at', { ascending: false })
          .limit(QUERY_LIMITS.accountActivity),
        supabase
          .from('account_transfers')
          .select('id, from_account_id, to_account_id, amount, transfer_fee, note, transferred_at')
          .eq('from_account_id', accountId)
          .order('transferred_at', { ascending: false })
          .limit(QUERY_LIMITS.accountActivity),
        supabase
          .from('account_transfers')
          .select('id, from_account_id, to_account_id, amount, transfer_fee, note, transferred_at')
          .eq('to_account_id', accountId)
          .order('transferred_at', { ascending: false })
          .limit(QUERY_LIMITS.accountActivity),
        supabase
          .from('personal_obligation_settlements')
          .select('id, amount, note, status, created_at, payer_account_id, receiver_account_id, personal_obligations(contact_name)')
          .eq('payer_account_id', accountId)
          .in('status', ['pending_confirmation', 'confirmed'])
          .order('created_at', { ascending: false })
          .limit(QUERY_LIMITS.accountActivity),
        supabase
          .from('personal_obligation_settlements')
          .select('id, amount, note, status, created_at, payer_account_id, receiver_account_id, personal_obligations(contact_name)')
          .eq('receiver_account_id', accountId)
          .eq('status', 'confirmed')
          .order('created_at', { ascending: false })
          .limit(QUERY_LIMITS.accountActivity),
      ])

      if (accErr) throw accErr
      if (expErr) throw expErr
      if (seErr)  throw seErr
      if (incErr) throw incErr
      if (tfoErr) throw tfoErr
      if (tfiErr) throw tfiErr
      if (pspErr) throw pspErr
      if (psrErr) throw psrErr

      let detailAccount = acc as FinancialAccount | null
      const detailSharedAccess: SharedFinancialAccountSummary | null = await getSharedFinancialAccountSummary(accountId)

      if (!detailAccount) {
        if (detailSharedAccess) {
          detailAccount = {
            id: detailSharedAccess.account_id,
            user_id: detailSharedAccess.owner_user_id,
            name: detailSharedAccess.account_name,
            emoji: detailSharedAccess.account_emoji,
            color: detailSharedAccess.account_color,
            type: detailSharedAccess.account_type,
            category: detailSharedAccess.account_category,
            balance: Number(detailSharedAccess.balance ?? 0),
            currency_code: detailSharedAccess.currency_code,
            base_currency_code: detailSharedAccess.base_currency_code,
            created_at: '',
          }
        }
      }

      setAccount(detailAccount)
      setSharedAccess(detailSharedAccess)

      const accMap = new Map<string, FinancialAccount>(
        (allAccounts ?? []).map((a: FinancialAccount) => [a.id, a])
      )
      if (detailAccount) accMap.set(detailAccount.id, detailAccount)

      const result: AccountDetailEntry[] = []
      const auditUserIds = Array.from(new Set((expenses ?? []).flatMap((expense) => [
        expense.owner_user_id,
        expense.created_by_user_id,
      ]).filter((id): id is string => Boolean(id))))
      const profileMap = new Map<string, string>()

      if (auditUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', auditUserIds)

        for (const profile of profiles ?? []) {
          profileMap.set(profile.id, profileLabel(profile.email))
        }
      }

      for (const e of expenses ?? []) {
        result.push({
          kind: 'expense',
          id: e.id,
          date: e.created_at,
          amount: e.amount,
          category: e.category,
          note: e.note,
          ownerUserId: e.owner_user_id,
          createdByUserId: e.created_by_user_id,
          ownerLabel: e.owner_user_id ? profileMap.get(e.owner_user_id) ?? 'Owner' : 'Owner',
          createdByLabel: e.created_by_user_id ? profileMap.get(e.created_by_user_id) ?? 'Creator' : 'Creator',
          hasReceipt: Boolean(e.has_receipt),
        })
      }

      for (const se of sharedExpenses ?? []) {
        const grp = firstRelation(se.shared_groups)
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
        const src = firstRelation(i.income_sources)
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
        result.push({
          kind: 'transfer',
          id: t.id,
          date: t.transferred_at,
          amount: t.amount,
          transferFee: Number(t.transfer_fee ?? 0),
          note: t.note,
          direction: 'out',
          otherAccount,
        })
      }

      for (const t of transfersIn ?? []) {
        const otherAccount = accMap.get(t.from_account_id)
        if (!otherAccount) continue
        result.push({
          kind: 'transfer',
          id: t.id,
          date: t.transferred_at,
          amount: t.amount,
          transferFee: Number(t.transfer_fee ?? 0),
          note: t.note,
          direction: 'in',
          otherAccount,
        })
      }

      for (const s of personalPaid ?? []) {
        const obligation = firstRelation(s.personal_obligations)
        result.push({
          kind: 'personal_settlement',
          id: s.id,
          date: s.created_at,
          amount: s.amount,
          note: s.note,
          direction: 'out',
          contactName: obligation?.contact_name ?? 'Contact',
          status: s.status,
        })
      }

      for (const s of personalRecv ?? []) {
        const obligation = firstRelation(s.personal_obligations)
        result.push({
          kind: 'personal_settlement',
          id: s.id,
          date: s.created_at,
          amount: s.amount,
          note: s.note,
          direction: 'in',
          contactName: obligation?.contact_name ?? 'Contact',
          status: s.status,
        })
      }

      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setEntries(result)
    } catch {
      toast.error('Failed to load account details')
    } finally {
      setIsLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const moneyIn = useMemo(() =>
    entries.reduce((s, e) =>
      (e.kind === 'income' || (e.kind === 'transfer' && e.direction === 'in') || (e.kind === 'personal_settlement' && e.direction === 'in')) ? s + e.amount : s, 0),
    [entries]
  )

  const moneyOut = useMemo(() =>
    entries.reduce((s, e) =>
      (e.kind === 'expense' || e.kind === 'shared_expense' || (e.kind === 'transfer' && e.direction === 'out') || (e.kind === 'personal_settlement' && e.direction === 'out')) ? s + e.amount : s, 0),
    [entries]
  )

  return { account, sharedAccess, entries, isLoading, moneyIn, moneyOut, reload: load }
}
