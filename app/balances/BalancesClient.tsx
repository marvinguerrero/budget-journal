'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Contact, PersonalObligation, PersonalObligationSettlement, SharedExpenseSettlement } from '@/types'
import { getBalancesData, GroupBalanceData } from '@/services/balances'
import { createSettlement, confirmSettlement, rejectSettlement, recallSettlement, undoConfirmSettlement } from '@/services/settlements'
import {
  applyPersonalObligationPayment,
  confirmPersonalObligationPayment,
  getPersonalObligations,
  recordExternalPersonalObligationPayment,
  recallPersonalObligationPayment,
  undoConfirmPersonalObligationPayment,
} from '@/services/personalObligations'
import { getContacts } from '@/services/contacts'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { computeGroupNetBalances } from '@/lib/balances'
import { formatCurrency } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Clock, Undo2,
  TrendingDown, TrendingUp, Wallet, Scale, Users,
} from 'lucide-react'
import Link from 'next/link'

interface Props {
  userId: string
}

// ── Per-group settle target ───────────────────────────────────────────────────
interface SettleTarget {
  groupId: string
  groupName: string
  groupEmoji: string
  counterpartyId: string
  counterpartyEmail: string
  amount: number
}

interface PersonalSettleTarget {
  obligation: PersonalBalanceItem
}

type PersonalBalanceItem = PersonalObligation & {
  display_remaining_amount: number
  total_paid_amount: number
  lifecycle_status: 'open' | 'partially_settled'
  resolved_contact_type: 'external' | 'registered'
}

type SettlementReviewTarget =
  | {
      kind: 'personal'
      settlement: PersonalObligationSettlement
      obligation: PersonalObligation
    }
  | {
      kind: 'shared'
      settlement: SharedExpenseSettlement & { groupName?: string; groupEmoji?: string }
    }

// ── AccountChips sub-component (module-level for Strict Mode safety) ──────────
interface AccountChipsProps {
  accounts: Array<{ id: string; emoji: string; name: string }>
  value: string
  onChange: (id: string) => void
  noneLabel?: string
}

function AccountChips({ accounts, value, onChange, noneLabel = 'No account' }: AccountChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange('')}
        className={cn(
          'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
          !value
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
        )}
      >
        {noneLabel}
      </button>
      {accounts.map((acc) => (
        <button
          key={acc.id}
          type="button"
          onClick={() => onChange(acc.id)}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
            value === acc.id
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
          )}
        >
          {acc.emoji} {acc.name}
        </button>
      ))}
    </div>
  )
}

function ConfirmedSettlementRow({
  title,
  subtitle,
  amount,
  onUndo,
}: {
  title: string
  subtitle: string
  amount: number
  onUndo: () => void
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
      </div>
      <span className="font-bold tabular-nums text-sm text-emerald-600 dark:text-emerald-400 flex-shrink-0">
        {formatCurrency(amount)}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
      >
        <Undo2 className="w-3 h-3" />
        Undo Confirmation
      </button>
    </div>
  )
}

// ── Aggregated view per counterparty ─────────────────────────────────────────
interface PersonBalance {
  counterpartyId: string
  counterpartyEmail: string
  totalAmount: number        // positive = owed to you, negative = you owe
  byGroup: Array<{
    groupId: string
    groupName: string
    groupEmoji: string
    amount: number           // same sign convention as totalAmount
  }>
}

type ActiveBalanceRecord =
  | {
      kind: 'shared_balance'
      direction: 'receivable' | 'payable'
      amount: number
      balance: PersonBalance
    }
  | {
      kind: 'personal_balance'
      direction: 'receivable' | 'payable'
      amount: number
      obligation: PersonalBalanceItem
    }
  | {
      kind: 'shared_settlement'
      direction: 'receivable' | 'payable'
      amount: number
      settlement: SharedExpenseSettlement & { groupName?: string; groupEmoji?: string }
    }
  | {
      kind: 'personal_settlement'
      direction: 'receivable' | 'payable'
      amount: number
      settlement: PersonalObligationSettlement
      obligation: PersonalObligation
    }

// ── Main component ────────────────────────────────────────────────────────────
export function BalancesClient({ userId }: Props) {
  const [groupData, setGroupData] = useState<GroupBalanceData[]>([])
  const [personalObligations, setPersonalObligations] = useState<PersonalObligation[]>([])
  const [personalSettlements, setPersonalSettlements] = useState<PersonalObligationSettlement[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { accounts } = useFinancialAccounts()

  // ── Settle dialog state ───────────────────────────────────────
  const [settleTarget,    setSettleTarget]    = useState<SettleTarget | null>(null)
  const [settleAccountId, setSettleAccountId] = useState('')
  const [settleNote,      setSettleNote]      = useState('')
  const [isSavingSettle,  setIsSavingSettle]  = useState(false)
  const [personalTarget, setPersonalTarget] = useState<PersonalSettleTarget | null>(null)
  const [personalAccountId, setPersonalAccountId] = useState('')
  const [personalNote, setPersonalNote] = useState('')
  const [isSavingPersonal, setIsSavingPersonal] = useState(false)

  // ── Settlement review/confirmation ───────────────────────────
  const [reviewTarget, setReviewTarget] = useState<SettlementReviewTarget | null>(null)
  const [reviewAccountId, setReviewAccountId] = useState('')
  const [reviewAmount, setReviewAmount] = useState('')
  const [isSavingReview, setIsSavingReview] = useState(false)

  // ── Filter state ──────────────────────────────────────────────
  const [filter, setFilter] = useState<'all' | 'you_owe' | 'owed_to_you'>('all')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [data, personal, contactData] = await Promise.all([
        getBalancesData(),
        getPersonalObligations(),
        getContacts(),
      ])
      setGroupData(data)
      setPersonalObligations(personal.obligations)
      setPersonalSettlements(personal.settlements)
      setContacts(contactData)
    } catch {
      toast.error('Failed to load balances')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── All settlements flat list (for pending confirmation section) ─
  const allSettlements = useMemo(() =>
    groupData.flatMap((gd) =>
      gd.settlements.map((s) => ({ ...s, groupName: gd.group.name, groupEmoji: gd.group.emoji }))
    ),
    [groupData]
  )

  // ── Pending settlements for quick action ──────────────────────
  const pendingToConfirm = useMemo(() =>
    allSettlements.filter((s) => s.receiver_user_id === userId && s.status === 'pending_confirmation'),
    [allSettlements, userId]
  )

  const pendingOutgoing = useMemo(() =>
    allSettlements.filter((s) => s.payer_user_id === userId && s.status === 'pending_confirmation'),
    [allSettlements, userId]
  )

  const confirmedShared = useMemo(() =>
    allSettlements.filter((s) => s.receiver_user_id === userId && s.status === 'confirmed'),
    [allSettlements, userId]
  )

  // ── Aggregate balances across all groups by counterparty ─────
  const personBalances = useMemo((): PersonBalance[] => {
    const map = new Map<string, PersonBalance>()

    for (const gd of groupData) {
      const balanceSettlements = gd.settlements
        .filter((s) => s.status === 'confirmed' || s.status === 'pending_confirmation')
        .map((s) => s.status === 'pending_confirmation'
          ? { ...s, status: 'confirmed' as const }
          : s)
      const groupBalances = computeGroupNetBalances(gd.expenses, gd.splits, balanceSettlements)

      for (const balance of groupBalances) {
        const iAmDebtor   = balance.debtorId   === userId
        const iAmCreditor = balance.creditorId === userId
        if (!iAmDebtor && !iAmCreditor) continue

        const cId    = iAmDebtor ? balance.creditorId    : balance.debtorId
        const cEmail = iAmDebtor ? balance.creditorEmail : balance.debtorEmail
        const signed = iAmDebtor ? -balance.amount : balance.amount

        const existing = map.get(cId)
        const groupEntry = {
          groupId:    gd.group.id,
          groupName:  gd.group.name,
          groupEmoji: gd.group.emoji,
          amount:     signed,
        }

        if (existing) {
          existing.totalAmount += signed
          existing.byGroup.push(groupEntry)
        } else {
          map.set(cId, {
            counterpartyId:    cId,
            counterpartyEmail: cEmail,
            totalAmount:       signed,
            byGroup:           [groupEntry],
          })
        }
      }
    }

    return Array.from(map.values())
      .filter((b) => Math.abs(b.totalAmount) > 0.005)
      .sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount))
  }, [groupData, userId])

  const personalPending = useMemo(() =>
    personalSettlements
      .filter((s) => s.status === 'pending_confirmation')
      .map((s) => ({
        settlement: s,
        obligation: personalObligations.find((o) => o.id === s.obligation_id) ?? null,
      }))
      .filter((item): item is { settlement: PersonalObligationSettlement; obligation: PersonalObligation } => !!item.obligation),
    [personalSettlements, personalObligations]
  )

  const personalPendingByObligation = useMemo(() => {
    const map = new Map<string, number>()
    for (const { settlement } of personalPending) {
      map.set(
        settlement.obligation_id,
        (map.get(settlement.obligation_id) ?? 0) + settlement.amount
      )
    }
    return map
  }, [personalPending])

  const personalPaidByObligation = useMemo(() => {
    const map = new Map<string, number>()
    for (const settlement of personalSettlements) {
      if (settlement.status !== 'confirmed') continue
      map.set(
        settlement.obligation_id,
        (map.get(settlement.obligation_id) ?? 0) + settlement.amount
      )
    }
    return map
  }, [personalSettlements])

  const contactTypeById = useMemo(() => {
    const map = new Map<string, 'external' | 'registered'>()
    for (const contact of contacts) {
      map.set(contact.id, contact.contact_type)
    }
    return map
  }, [contacts])

  const openPersonalObligations = useMemo(() =>
    personalObligations
      .filter((o) => o.status === 'open')
      .map((o): PersonalBalanceItem => {
        const totalPaid = personalPaidByObligation.get(o.id) ?? 0
        return {
          ...o,
          display_remaining_amount: Math.max(
            0,
            o.remaining_amount - (personalPendingByObligation.get(o.id) ?? 0)
          ),
          total_paid_amount: totalPaid,
          lifecycle_status: totalPaid > 0.005 ? 'partially_settled' : 'open',
          resolved_contact_type: o.contact_id
            ? contactTypeById.get(o.contact_id) ?? (o.contact_user_id ? 'registered' : 'external')
            : o.contact_user_id ? 'registered' : 'external',
        }
      })
      .filter((o) => o.display_remaining_amount > 0.005),
    [personalObligations, personalPendingByObligation, personalPaidByObligation, contactTypeById]
  )

  const confirmedPersonal = useMemo(() =>
    personalSettlements
      .filter((s) => s.status === 'confirmed')
      .map((s) => ({
        settlement: s,
        obligation: personalObligations.find((o) => o.id === s.obligation_id) ?? null,
      }))
      .filter((item): item is { settlement: PersonalObligationSettlement; obligation: PersonalObligation } => !!item.obligation),
    [personalSettlements, personalObligations]
  )

  const activeBalanceRecords = useMemo((): ActiveBalanceRecord[] => {
    const records: ActiveBalanceRecord[] = []

    for (const balance of personBalances) {
      records.push({
        kind: 'shared_balance',
        direction: balance.totalAmount > 0 ? 'receivable' : 'payable',
        amount: Math.abs(balance.totalAmount),
        balance,
      })
    }

    for (const obligation of openPersonalObligations) {
      records.push({
        kind: 'personal_balance',
        direction: obligation.direction === 'owed_to_user' ? 'receivable' : 'payable',
        amount: obligation.display_remaining_amount,
        obligation,
      })
    }

    for (const settlement of pendingToConfirm) {
      records.push({
        kind: 'shared_settlement',
        direction: 'receivable',
        amount: settlement.amount,
        settlement,
      })
    }

    for (const settlement of pendingOutgoing) {
      records.push({
        kind: 'shared_settlement',
        direction: 'payable',
        amount: settlement.amount,
        settlement,
      })
    }

    for (const { settlement, obligation } of personalPending) {
      records.push({
        kind: 'personal_settlement',
        direction: obligation.direction === 'owed_to_user' ? 'receivable' : 'payable',
        amount: settlement.amount,
        settlement,
        obligation,
      })
    }

    return records.filter((record) => record.amount > 0.005)
  }, [personBalances, openPersonalObligations, pendingToConfirm, pendingOutgoing, personalPending])

  const receivableRecords = useMemo(() =>
    activeBalanceRecords.filter((record) => record.direction === 'receivable'),
    [activeBalanceRecords]
  )

  const payableRecords = useMemo(() =>
    activeBalanceRecords.filter((record) => record.direction === 'payable'),
    [activeBalanceRecords]
  )

  const combinedOwedToYou = useMemo(() =>
    receivableRecords.reduce((sum, record) => sum + record.amount, 0),
    [receivableRecords]
  )

  const combinedYouOwe = useMemo(() =>
    payableRecords.reduce((sum, record) => sum + record.amount, 0),
    [payableRecords]
  )

  const personalAwaitingRecords = useMemo(() =>
    activeBalanceRecords.filter((record): record is Extract<ActiveBalanceRecord, { kind: 'personal_settlement' }> =>
      record.kind === 'personal_settlement'
    ),
    [activeBalanceRecords]
  )

  const sharedAwaitingReceivableRecords = useMemo(() =>
    activeBalanceRecords.filter((record): record is Extract<ActiveBalanceRecord, { kind: 'shared_settlement' }> =>
      record.kind === 'shared_settlement' && record.direction === 'receivable'
    ),
    [activeBalanceRecords]
  )

  const sharedAwaitingPayableRecords = useMemo(() =>
    activeBalanceRecords.filter((record): record is Extract<ActiveBalanceRecord, { kind: 'shared_settlement' }> =>
      record.kind === 'shared_settlement' && record.direction === 'payable'
    ),
    [activeBalanceRecords]
  )

  const personalBalanceRecords = useMemo(() =>
    activeBalanceRecords.filter((record): record is Extract<ActiveBalanceRecord, { kind: 'personal_balance' }> =>
      record.kind === 'personal_balance'
    ),
    [activeBalanceRecords]
  )

  const sharedBalanceRecords = useMemo(() =>
    activeBalanceRecords.filter((record): record is Extract<ActiveBalanceRecord, { kind: 'shared_balance' }> =>
      record.kind === 'shared_balance'
    ),
    [activeBalanceRecords]
  )

  const visibleSharedBalanceRecords = useMemo(() =>
    sharedBalanceRecords.filter((record) => {
      if (filter === 'owed_to_you') return record.direction === 'receivable'
      if (filter === 'you_owe') return record.direction === 'payable'
      return true
    }),
    [sharedBalanceRecords, filter]
  )

  // ── Settle handler ────────────────────────────────────────────
  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settleTarget) return
    setIsSavingSettle(true)
    try {
      await createSettlement({
        groupId:        settleTarget.groupId,
        receiverUserId: settleTarget.counterpartyId,
        receiverEmail:  settleTarget.counterpartyEmail,
        amount:         settleTarget.amount,
        payerAccountId: settleAccountId || null,
        note:           settleNote,
      })
      // Refresh data to reflect new pending settlement
      await load()
      setSettleTarget(null)
      setSettleAccountId('')
      setSettleNote('')
      toast.success('Payment sent — waiting for confirmation')
    } catch {
      toast.error('Failed to send settlement')
    } finally {
      setIsSavingSettle(false)
    }
  }

  const handleReject = async (id: string) => {
    try {
      await rejectSettlement(id)
      await load()
      toast.success('Payment rejected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    }
  }

  const handleRecall = async (id: string) => {
    try {
      await recallSettlement(id)
      await load()
      toast.success('Settlement recalled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to recall')
    }
  }

  const handlePersonalSettle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!personalTarget) return
    setIsSavingPersonal(true)
    try {
      const payload = {
        obligationId: personalTarget.obligation.id,
        amount: personalTarget.obligation.display_remaining_amount,
        accountId: personalAccountId || null,
        note: personalNote,
      }

      if (personalTarget.obligation.resolved_contact_type === 'external') {
        await recordExternalPersonalObligationPayment(payload)
      } else {
        await applyPersonalObligationPayment(payload)
      }
      await load()
      setPersonalTarget(null)
      setPersonalAccountId('')
      setPersonalNote('')
      toast.success(personalTarget.obligation.resolved_contact_type === 'external' ? 'Payment recorded' : 'Payment marked')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to settle')
    } finally {
      setIsSavingPersonal(false)
    }
  }

  const handleReviewConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewTarget) return

    const amount = Number(reviewAmount)
    const maxAmount = reviewTarget.settlement.amount
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Settlement amount must be greater than zero')
      return
    }
    if (amount > maxAmount + 0.005) {
      toast.error('Settlement amount cannot exceed the remaining balance')
      return
    }

    setIsSavingReview(true)
    try {
      if (reviewTarget.kind === 'shared') {
        await confirmSettlement(reviewTarget.settlement.id, reviewAccountId || null, amount)
      } else {
        await confirmPersonalObligationPayment(reviewTarget.settlement.id, amount, reviewAccountId || null)
      }
      await load()
      closeReview()
      toast.success(amount >= maxAmount - 0.005 ? 'Payment confirmed' : 'Partial payment confirmed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm payment')
    } finally {
      setIsSavingReview(false)
    }
  }

  const handleRecallPersonal = async (id: string) => {
    try {
      await recallPersonalObligationPayment(id)
      await load()
      toast.success('Payment recalled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to recall')
    }
  }

  const handleUndoSharedConfirmation = async (id: string) => {
    try {
      await undoConfirmSettlement(id)
      await load()
      toast.success('Confirmation reversed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to undo confirmation')
    }
  }

  const handleUndoPersonalConfirmation = async (id: string) => {
    try {
      await undoConfirmPersonalObligationPayment(id)
      await load()
      toast.success('Confirmation reversed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to undo confirmation')
    }
  }

  const shortName = (email: string) => email.split('@')[0]
  const accountLabel = (id?: string | null) => {
    if (!id) return 'No account selected'
    const account = accounts.find((a) => a.id === id)
    return account ? `${account.emoji} ${account.name}` : 'Selected account'
  }
  const openReview = (target: SettlementReviewTarget) => {
    setReviewTarget(target)
    setReviewAmount(String(target.settlement.amount))
    setReviewAccountId(target.settlement.receiver_account_id ?? '')
  }

  const closeReview = () => {
    setReviewTarget(null)
    setReviewAmount('')
    setReviewAccountId('')
  }

  // ── Loading skeleton ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Balances</h1>
        <p className="text-sm text-muted-foreground">Personal and shared interpersonal balances</p>
      </div>

      {/* Summary cards */}
      {(combinedOwedToYou > 0 || combinedYouOwe > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs text-muted-foreground">You&apos;re owed</p>
            </div>
            <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(combinedOwedToYou)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              from {receivableRecords.length} {receivableRecords.length === 1 ? 'record' : 'records'}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-muted-foreground">You owe</p>
            </div>
            <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {formatCurrency(combinedYouOwe)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              to {payableRecords.length} {payableRecords.length === 1 ? 'record' : 'records'}
            </p>
          </div>
        </div>
      )}

      {personalAwaitingRecords.length > 0 && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Personal Payments Pending</p>
          </div>
          <div className="space-y-2">
            {personalAwaitingRecords.map(({ settlement, obligation }) => (
              <div key={settlement.id} className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {obligation.direction === 'owed_to_user' ? 'Payment from' : 'Paid'} {obligation.contact_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {obligation.category}{settlement.note ? ` · ${settlement.note}` : ''}
                  </p>
                </div>
                <span className="font-bold tabular-nums text-sm text-rose-600 dark:text-rose-400 flex-shrink-0">
                  -{formatCurrency(settlement.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => openReview({ kind: 'personal', settlement, obligation })}
                  className="px-2.5 py-1.5 rounded-lg bg-muted border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
                >
                  Review
                </button>
                {obligation.direction === 'owed_to_user' ? (
                  <button
                    type="button"
                    onClick={() => openReview({ kind: 'personal', settlement, obligation })}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors flex-shrink-0"
                  >
                    Confirm
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRecallPersonal(settlement.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
                  >
                    <Undo2 className="w-3 h-3" />
                    Recall
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(confirmedPersonal.length > 0 || confirmedShared.length > 0) && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Settlement History</p>
          </div>
          <div className="space-y-2">
            {confirmedPersonal.map(({ settlement, obligation }) => (
              <ConfirmedSettlementRow
                key={`personal-${settlement.id}`}
                title={settlement.receiver_account_id ? `Received from ${obligation.contact_name}` : `Paid ${obligation.contact_name}`}
                subtitle={`Personal · ${obligation.category}${settlement.note ? ` · ${settlement.note}` : ''}`}
                amount={settlement.amount}
                onUndo={() => handleUndoPersonalConfirmation(settlement.id)}
              />
            ))}
            {confirmedShared.map((s) => (
              <ConfirmedSettlementRow
                key={`shared-${s.id}`}
                title={`${shortName(s.payer_email)} paid you`}
                subtitle={`${(s as SharedExpenseSettlement & { groupEmoji?: string }).groupEmoji ?? '👥'} ${(s as SharedExpenseSettlement & { groupName?: string }).groupName ?? 'Shared Budget'}${s.note ? ` · ${s.note}` : ''}`}
                amount={s.amount}
                onUndo={() => handleUndoSharedConfirmation(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pending confirmations */}
      {sharedAwaitingReceivableRecords.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Payments to Confirm</p>
          </div>
          <div className="space-y-2">
            {sharedAwaitingReceivableRecords.map(({ settlement: s }) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {shortName(s.payer_email)} paid you
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(s as typeof s & { groupEmoji: string; groupName: string }).groupEmoji}{' '}
                    {(s as typeof s & { groupEmoji: string; groupName: string }).groupName}
                    {s.note ? ` · ${s.note}` : ''}
                  </p>
                </div>
                <span className="font-bold tabular-nums text-sm text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  +{formatCurrency(s.amount)}
                </span>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => openReview({ kind: 'shared', settlement: s })}
                    className="px-2.5 py-1.5 rounded-lg bg-muted border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={() => openReview({ kind: 'shared', settlement: s })}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(s.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Awaiting confirmation (outgoing) */}
      {sharedAwaitingPayableRecords.length > 0 && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Awaiting Confirmation</p>
          </div>
          <div className="space-y-2">
            {sharedAwaitingPayableRecords.map(({ settlement: s }) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border">
                <span className="text-base flex-shrink-0">
                  {(s as typeof s & { groupEmoji: string }).groupEmoji}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    Paid {shortName(s.receiver_email)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(s as typeof s & { groupName: string }).groupName}
                    {s.note ? ` · ${s.note}` : ''}
                  </p>
                </div>
                <span className="font-bold tabular-nums text-sm text-rose-600 dark:text-rose-400 flex-shrink-0">
                  -{formatCurrency(s.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRecall(s.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
                >
                  <Undo2 className="w-3 h-3" />
                  Recall
                </button>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70">
            You can recall a payment before the receiver confirms it.
          </p>
        </div>
      )}

      {/* Filter chips */}
      {sharedBalanceRecords.length > 0 && (
        <div className="flex gap-1.5">
          {([
            ['all',         'All'],
            ['owed_to_you', '💰 Owed to You'],
            ['you_owe',     '💸 You Owe'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setFilter(val)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                filter === val
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Balance list */}
      {personalBalanceRecords.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm">Personal</h2>
          {personalBalanceRecords.map(({ obligation }) => {
            const iOwe = obligation.direction === 'user_owes'
            return (
              <div
                key={obligation.id}
                className={`rounded-2xl border p-4 space-y-3 ${
                  iOwe
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : 'border-emerald-500/20 bg-emerald-500/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${
                    iOwe ? 'bg-amber-500/15' : 'bg-emerald-500/15'
                  }`}>
                    {iOwe ? '💸' : '💰'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">
                      {iOwe ? `You owe ${obligation.contact_name}` : `${obligation.contact_name} owes you`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Personal · {obligation.category}{obligation.note ? ` · ${obligation.note}` : ''}
                    </p>
                    {obligation.lifecycle_status === 'partially_settled' && (
                      <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                        Partially Settled · Paid {formatCurrency(obligation.total_paid_amount)}
                      </p>
                    )}
                  </div>
                  <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${
                    iOwe ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
                  }`}>
                    {formatCurrency(obligation.display_remaining_amount)}
                  </span>
                  {iOwe || obligation.resolved_contact_type === 'external' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPersonalTarget({ obligation })
                        setPersonalAccountId('')
                        setPersonalNote('')
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
                    >
                      {iOwe ? 'Pay Now' : 'Record Received'}
                    </button>
                  ) : (
                    <span className="px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border text-xs font-medium text-muted-foreground flex-shrink-0">
                      Awaiting payment
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeBalanceRecords.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Scale className="w-8 h-8 text-muted-foreground" />
            </div>
          </div>
          <p className="font-semibold">All settled up</p>
          <p className="text-sm text-muted-foreground">
            No outstanding personal or shared balances.
          </p>
        </div>
      ) : visibleSharedBalanceRecords.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm">Shared Budgets</h2>
          {visibleSharedBalanceRecords.map(({ balance: pb }) => {
            const iOwe     = pb.totalAmount < 0
            const name     = shortName(pb.counterpartyEmail)
            const absTotal = Math.abs(pb.totalAmount)
            // Filter to only the group entries that contribute to this direction
            const relevantGroups = pb.byGroup.filter((g) => iOwe ? g.amount < 0 : g.amount > 0)

            return (
              <div
                key={pb.counterpartyId}
                className={`rounded-2xl border p-4 space-y-3 ${
                  iOwe
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : 'border-emerald-500/20 bg-emerald-500/5'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${
                    iOwe ? 'bg-amber-500/15' : 'bg-emerald-500/15'
                  }`}>
                    {iOwe ? '💸' : '💰'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">
                      {iOwe ? `You owe ${name}` : `${name} owes you`}
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      iOwe
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    } font-bold tabular-nums`}>
                      {formatCurrency(absTotal)}
                    </p>
                  </div>
                </div>

                {/* Per-group breakdown */}
                {relevantGroups.length > 0 && (
                  <div className="space-y-1.5 pl-12">
                    {relevantGroups.map((g) => (
                      <div key={g.groupId} className="flex items-center gap-2">
                        <span className="text-sm flex-shrink-0">{g.groupEmoji}</span>
                        <span className="text-xs text-muted-foreground flex-1 truncate">{g.groupName}</span>
                        <span className="text-xs font-semibold tabular-nums text-foreground flex-shrink-0">
                          {formatCurrency(Math.abs(g.amount))}
                        </span>
                        {iOwe && (
                          <button
                            type="button"
                            onClick={() => setSettleTarget({
                              groupId:          g.groupId,
                              groupName:        g.groupName,
                              groupEmoji:       g.groupEmoji,
                              counterpartyId:   pb.counterpartyId,
                              counterpartyEmail: pb.counterpartyEmail,
                              amount:           Math.abs(g.amount),
                            })}
                            className="px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
                          >
                            Settle
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* No groups at all */}
      {groupData.length === 0 && !isLoading && (
        <div className="text-center py-20 space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
          </div>
          <p className="font-semibold">No shared groups yet</p>
          <p className="text-sm text-muted-foreground">
            Join or create a Shared Budget group to start tracking balances.
          </p>
          <Link
            href="/shared"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Users className="w-4 h-4" />
            Go to Shared Budgets
          </Link>
        </div>
      )}

      {/* ── Settle dialog ── */}
      <Dialog
        open={!!settleTarget}
        onOpenChange={(o) => { if (!o) { setSettleTarget(null); setSettleAccountId(''); setSettleNote('') } }}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Settle Payment</DialogTitle>
          </DialogHeader>
          {settleTarget && (
            <form onSubmit={handleSettle} className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                <div>
                  <p className="text-xs text-muted-foreground">You owe</p>
                  <p className="text-sm font-semibold">{shortName(settleTarget.counterpartyEmail)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {settleTarget.groupEmoji} {settleTarget.groupName}
                  </p>
                </div>
                <span className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatCurrency(settleTarget.amount)}
                </span>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  Pay from account <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <AccountChips
                  accounts={accounts}
                  value={settleAccountId}
                  onChange={setSettleAccountId}
                  noneLabel="No account"
                />
                {settleAccountId && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(settleTarget.amount)} will be deducted from this account.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Note <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. GCash transfer"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11 rounded-xl"
                  onClick={() => { setSettleTarget(null); setSettleAccountId(''); setSettleNote('') }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingSettle}>
                  {isSavingSettle ? 'Sending…' : 'Mark as Paid'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!personalTarget}
        onOpenChange={(o) => { if (!o) { setPersonalTarget(null); setPersonalAccountId(''); setPersonalNote('') } }}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {personalTarget?.obligation.direction === 'owed_to_user' ? 'Record Payment Received' : 'Pay Personal Balance'}
            </DialogTitle>
          </DialogHeader>
          {personalTarget && (
            <form onSubmit={handlePersonalSettle} className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/60 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {personalTarget.obligation.direction === 'owed_to_user' ? 'Received from' : 'Paying'}
                  </p>
                  <p className="text-sm font-semibold">{personalTarget.obligation.contact_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {personalTarget.obligation.category}
                  </p>
                </div>
                <span className="text-xl font-bold tabular-nums">
                  {formatCurrency(personalTarget.obligation.display_remaining_amount)}
                </span>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  {personalTarget.obligation.direction === 'owed_to_user' ? 'Receive into account' : 'Pay from account'} <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <AccountChips
                  accounts={accounts}
                  value={personalAccountId}
                  onChange={setPersonalAccountId}
                  noneLabel="No account"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Note <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. GCash transfer"
                  value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11 rounded-xl"
                  onClick={() => { setPersonalTarget(null); setPersonalAccountId(''); setPersonalNote('') }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingPersonal}>
                  {isSavingPersonal ? 'Saving…' : personalTarget.obligation.direction === 'owed_to_user' ? 'Record Received' : 'Mark as Paid'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Settlement review and confirmation ── */}
      <Dialog open={!!reviewTarget} onOpenChange={(o) => { if (!o) closeReview() }}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Payment Review</DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <form onSubmit={handleReviewConfirm} className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/60 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {reviewTarget.kind === 'personal' ? 'Personal payment' : 'Shared payment'}
                  </p>
                  <p className="text-sm font-semibold">
                    {reviewTarget.kind === 'personal'
                      ? `Paid ${reviewTarget.obligation.contact_name}`
                      : `${shortName(reviewTarget.settlement.payer_email)} paid you`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {reviewTarget.kind === 'personal'
                      ? reviewTarget.obligation.category
                      : `${reviewTarget.settlement.groupEmoji ?? '👥'} ${reviewTarget.settlement.groupName ?? 'Shared Budget'}`}
                  </p>
                </div>
                <span className="text-xl font-bold tabular-nums">
                  {formatCurrency(Number(reviewAmount) || reviewTarget.settlement.amount)}
                </span>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Settlement Amount</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max={reviewTarget.settlement.amount}
                    step="0.01"
                    value={reviewAmount}
                    onChange={(e) => setReviewAmount(e.target.value)}
                    className="pl-8 h-11 rounded-xl font-semibold"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Outstanding balance: {formatCurrency(reviewTarget.settlement.amount)}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  Result: {reviewTarget.settlement.amount - (Number(reviewAmount) || 0) <= 0.005 ? 'Settled' : 'Partially Settled'}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  Destination account <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <AccountChips
                  accounts={accounts}
                  value={reviewAccountId}
                  onChange={setReviewAccountId}
                  noneLabel="No account"
                />
                {reviewAccountId && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(Number(reviewAmount) || 0)} will be added to this account.
                  </p>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium capitalize">
                    {reviewTarget.settlement.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-medium text-right">
                    {reviewTarget.kind === 'shared'
                      ? reviewTarget.settlement.payer_account_label ?? accountLabel(reviewTarget.settlement.payer_account_id)
                      : accountLabel(reviewTarget.settlement.payer_account_id)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-medium text-right">
                    {accountLabel(reviewAccountId || reviewTarget.settlement.receiver_account_id)}
                  </span>
                </div>
                {reviewTarget.settlement.note && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Note</p>
                    <p className="text-sm">{reviewTarget.settlement.note}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Payment History</p>
                  <p className="text-xs text-muted-foreground">
                    Remaining after this: {formatCurrency(Math.max(0, reviewTarget.settlement.amount - (Number(reviewAmount) || 0)))}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {(reviewTarget.kind === 'personal'
                    ? confirmedPersonal
                        .filter(({ obligation }) => obligation.id === reviewTarget.obligation.id)
                        .map(({ settlement }) => ({
                          id: settlement.id,
                          amount: settlement.amount,
                          date: settlement.confirmed_at ?? settlement.created_at,
                        }))
                    : confirmedShared
                        .filter((settlement) =>
                          settlement.group_id === reviewTarget.settlement.group_id &&
                          settlement.payer_user_id === reviewTarget.settlement.payer_user_id &&
                          settlement.receiver_user_id === reviewTarget.settlement.receiver_user_id
                        )
                        .map((settlement) => ({
                          id: settlement.id,
                          amount: settlement.amount,
                          date: settlement.confirmed_at ?? settlement.created_at,
                        }))
                  ).map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{new Date(payment.date).toLocaleDateString()}</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(payment.amount)}</span>
                    </div>
                  ))}
                  {(reviewTarget.kind === 'personal'
                    ? confirmedPersonal.filter(({ obligation }) => obligation.id === reviewTarget.obligation.id).length
                    : confirmedShared.filter((settlement) =>
                        settlement.group_id === reviewTarget.settlement.group_id &&
                        settlement.payer_user_id === reviewTarget.settlement.payer_user_id &&
                        settlement.receiver_user_id === reviewTarget.settlement.receiver_user_id
                      ).length
                  ) === 0 && (
                    <p className="text-xs text-muted-foreground">No confirmed payments yet.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={closeReview}>
                  Close
                </Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700" disabled={isSavingReview}>
                  {isSavingReview ? 'Confirming…' : 'Confirm Received'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
