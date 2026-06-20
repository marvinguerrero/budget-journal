'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FinancialAccount } from '@/types'
import { toast } from 'sonner'
import { QUERY_LIMITS } from '@/lib/queryLimits'

const ACTIVITY_ACCOUNT_SELECT = `
  id,
  user_id,
  name,
  emoji,
  color,
  type,
  category,
  balance,
  currency_code,
  base_currency_code,
  created_at
`

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

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
      transferFee: number
      note: string
      fromAccount: FinancialAccount
      toAccount: FinancialAccount
    }
  | {
      kind: 'personal_settlement'
      id: string
      date: string
      amount: number
      note: string
      direction: 'in' | 'out'
      contactName: string
      account: FinancialAccount
      status: 'pending_confirmation' | 'confirmed'
    }
  | {
      kind: 'settlement_history'
      id: string
      date: string
      amount: number
      note: string
      event: 'confirmed' | 'reversed'
      direction: 'in' | 'out'
      counterpartyName: string
      account: FinancialAccount
      fromLabel?: string | null
      toLabel?: string | null
    }

export function useAccountActivity(month?: number, year?: number) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()

      const { data: accountRows } = await supabase.from('financial_accounts').select(ACTIVITY_ACCOUNT_SELECT)
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
        { data: personalSettlements, error: psErr },
        { data: sharedSettlements, error: ssErr },
      ] = await Promise.all([
        withDates(
          supabase
            .from('expenses')
            .select('id, account_id, created_at, amount, category, note')
            .not('account_id', 'is', null)
            .order('created_at', { ascending: false }),
          'created_at',
        ).limit(QUERY_LIMITS.accountActivity),
        withDates(
          supabase
            .from('income_entries')
            .select('id, account_id, income_source_id, amount, note, received_at, income_sources(name, emoji)')
            .not('account_id', 'is', null)
            .eq('status', 'received'),
          'received_at',
        ).limit(QUERY_LIMITS.accountActivity),
        withDates(
          supabase
            .from('account_transfers')
            .select('id, from_account_id, to_account_id, amount, transfer_fee, note, transferred_at')
            .order('transferred_at', { ascending: false }),
          'transferred_at',
        ).limit(QUERY_LIMITS.accountActivity),
        withDates(
          supabase
            .from('personal_obligation_settlements')
            .select('id, amount, note, status, created_at, confirmed_at, payer_account_id, receiver_account_id, personal_obligations(contact_name)')
            .in('status', ['pending_confirmation', 'confirmed'])
            .or('payer_account_id.not.is.null,receiver_account_id.not.is.null')
            .order('created_at', { ascending: false }),
          'created_at',
        ).limit(QUERY_LIMITS.accountActivity),
        supabase
          .from('shared_expense_settlements')
          .select('id, amount, note, status, created_at, confirmed_at, confirmation_reversed_at, payer_account_id, receiver_account_id, payer_account_label, receiver_account_label, payer_email, receiver_email')
          .or('payer_account_id.not.is.null,receiver_account_id.not.is.null')
          .or('confirmed_at.not.is.null,confirmation_reversed_at.not.is.null')
          .order('created_at', { ascending: false })
          .limit(QUERY_LIMITS.accountActivity),
      ])

      if (expErr) throw expErr
      if (incErr) throw incErr
      if (tfrErr) throw tfrErr
      if (psErr) throw psErr
      if (ssErr) throw ssErr

      const result: ActivityEntry[] = []

      for (const e of expenses ?? []) {
        const account = accMap.get(e.account_id)
        if (!account) continue
        result.push({ kind: 'expense', id: e.id, date: e.created_at, amount: e.amount, category: e.category, note: e.note, account })
      }

      for (const i of incomes ?? []) {
        const account = accMap.get(i.account_id)
        if (!account) continue
        const src = firstRelation(i.income_sources)
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
        result.push({
          kind: 'transfer',
          id: t.id,
          date: t.transferred_at,
          amount: t.amount,
          transferFee: Number(t.transfer_fee ?? 0),
          note: t.note,
          fromAccount,
          toAccount,
        })
      }

      for (const s of personalSettlements ?? []) {
        const accountId = s.payer_account_id ?? s.receiver_account_id
        const account = accountId ? accMap.get(accountId) : null
        if (!account) continue
        const obligation = firstRelation(s.personal_obligations)
        result.push({
          kind: 'personal_settlement',
          id: s.id,
          date: s.created_at,
          amount: s.amount,
          note: s.note,
          direction: s.payer_account_id ? 'out' : 'in',
          contactName: obligation?.contact_name ?? 'Contact',
          account,
          status: s.status,
        })
        if (s.confirmed_at) {
          result.push({
            kind: 'settlement_history',
            id: `${s.id}-confirmed`,
            date: s.confirmed_at,
            amount: s.amount,
            note: s.note,
            event: 'confirmed',
            direction: s.payer_account_id ? 'out' : 'in',
            counterpartyName: obligation?.contact_name ?? 'Contact',
            account,
            fromLabel: s.payer_account_id ? `${account.emoji} ${account.name}` : obligation?.contact_name ?? 'Contact',
            toLabel: s.receiver_account_id ? `${account.emoji} ${account.name}` : obligation?.contact_name ?? 'Contact',
          })
        }
        if (s.confirmation_reversed_at) {
          result.push({
            kind: 'settlement_history',
            id: `${s.id}-reversed`,
            date: s.confirmation_reversed_at,
            amount: s.amount,
            note: s.note,
            event: 'reversed',
            direction: s.payer_account_id ? 'out' : 'in',
            counterpartyName: obligation?.contact_name ?? 'Contact',
            account,
            fromLabel: s.payer_account_id ? `${account.emoji} ${account.name}` : obligation?.contact_name ?? 'Contact',
            toLabel: s.receiver_account_id ? `${account.emoji} ${account.name}` : obligation?.contact_name ?? 'Contact',
          })
        }
      }

      for (const s of sharedSettlements ?? []) {
        const payerAccount = s.payer_account_id ? accMap.get(s.payer_account_id) : null
        const receiverAccount = s.receiver_account_id ? accMap.get(s.receiver_account_id) : null
        const fromLabel = s.payer_account_label ?? (payerAccount ? `${payerAccount.emoji} ${payerAccount.name}` : null)
        const toLabel = s.receiver_account_label ?? (receiverAccount ? `${receiverAccount.emoji} ${receiverAccount.name}` : null)

        const pushHistory = (account: FinancialAccount, direction: 'in' | 'out', event: 'confirmed' | 'reversed', date: string) => {
          result.push({
            kind: 'settlement_history',
            id: `${s.id}-shared-${direction}-${event}`,
            date,
            amount: s.amount,
            note: s.note,
            event,
            direction,
            counterpartyName: direction === 'out'
              ? s.receiver_email?.split('@')[0] ?? 'Receiver'
              : s.payer_email?.split('@')[0] ?? 'Payer',
            account,
            fromLabel,
            toLabel,
          })
        }

        if (s.confirmed_at) {
          if (payerAccount) pushHistory(payerAccount, 'out', 'confirmed', s.confirmed_at)
          if (receiverAccount) pushHistory(receiverAccount, 'in', 'confirmed', s.confirmed_at)
        }
        if (s.confirmation_reversed_at) {
          if (payerAccount) pushHistory(payerAccount, 'out', 'reversed', s.confirmation_reversed_at)
          if (receiverAccount) pushHistory(receiverAccount, 'in', 'reversed', s.confirmation_reversed_at)
        }
      }

      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setEntries(result)
    } catch {
      toast.error('Failed to load activity')
    } finally {
      setIsLoading(false)
    }
  }, [month, year])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  return { entries, isLoading, reload: load }
}
