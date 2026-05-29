'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { SharedExpenseSettlement } from '@/types'
import { getBalancesData, GroupBalanceData } from '@/services/balances'
import { createSettlement, confirmSettlement, rejectSettlement, recallSettlement } from '@/services/settlements'
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
  ArrowRight, CheckCircle2, XCircle, Clock, Undo2,
  TrendingDown, TrendingUp, Wallet, Scale, Users,
} from 'lucide-react'

interface Props {
  userId: string
  userEmail: string
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

// ── Main component ────────────────────────────────────────────────────────────
export function BalancesClient({ userId, userEmail: _userEmail }: Props) {
  const [groupData, setGroupData] = useState<GroupBalanceData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { accounts } = useFinancialAccounts()

  // ── Settle dialog state ───────────────────────────────────────
  const [settleTarget,    setSettleTarget]    = useState<SettleTarget | null>(null)
  const [settleAccountId, setSettleAccountId] = useState('')
  const [settleNote,      setSettleNote]      = useState('')
  const [isSavingSettle,  setIsSavingSettle]  = useState(false)

  // ── Settlement confirm/reject (for pending settlements) ───────
  const [confirmingId,    setConfirmingId]    = useState<string | null>(null)
  const [confirmAccId,    setConfirmAccId]    = useState('')
  const [isSavingConfirm, setIsSavingConfirm] = useState(false)

  // ── Filter state ──────────────────────────────────────────────
  const [filter, setFilter] = useState<'all' | 'you_owe' | 'owed_to_you'>('all')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getBalancesData()
      setGroupData(data)
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

  // ── Aggregate balances across all groups by counterparty ─────
  const personBalances = useMemo((): PersonBalance[] => {
    const map = new Map<string, PersonBalance>()

    for (const gd of groupData) {
      const groupBalances = computeGroupNetBalances(gd.expenses, gd.splits, gd.settlements)

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

  const owedToYou = useMemo(() => personBalances.filter((b) => b.totalAmount > 0), [personBalances])
  const youOwe    = useMemo(() => personBalances.filter((b) => b.totalAmount < 0), [personBalances])

  const totalOwedToYou = useMemo(() => owedToYou.reduce((s, b) => s + b.totalAmount, 0), [owedToYou])
  const totalYouOwe    = useMemo(() => youOwe.reduce((s, b) => s + Math.abs(b.totalAmount), 0), [youOwe])

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

  // ── Confirm handler ───────────────────────────────────────────
  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmingId) return
    setIsSavingConfirm(true)
    try {
      await confirmSettlement(confirmingId, confirmAccId || null)
      await load()
      setConfirmingId(null)
      setConfirmAccId('')
      toast.success('Payment confirmed!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm')
    } finally {
      setIsSavingConfirm(false)
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

  const shortName = (email: string) => email.split('@')[0]

  const confirmingSettlement = useMemo(
    () => allSettlements.find((s) => s.id === confirmingId) ?? null,
    [allSettlements, confirmingId]
  )

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

  const visible = filter === 'you_owe' ? youOwe : filter === 'owed_to_you' ? owedToYou : personBalances

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Balances</h1>
        <p className="text-sm text-muted-foreground">Interpersonal balances from shared budgets</p>
      </div>

      {/* Summary cards */}
      {(totalOwedToYou > 0 || totalYouOwe > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs text-muted-foreground">You're owed</p>
            </div>
            <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(totalOwedToYou)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              from {owedToYou.length} {owedToYou.length === 1 ? 'person' : 'people'}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-muted-foreground">You owe</p>
            </div>
            <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {formatCurrency(totalYouOwe)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              to {youOwe.length} {youOwe.length === 1 ? 'person' : 'people'}
            </p>
          </div>
        </div>
      )}

      {/* Pending confirmations */}
      {pendingToConfirm.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Payments to Confirm</p>
          </div>
          <div className="space-y-2">
            {pendingToConfirm.map((s) => (
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
                    onClick={() => { setConfirmingId(s.id); setConfirmAccId('') }}
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
      {pendingOutgoing.length > 0 && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Awaiting Confirmation</p>
          </div>
          <div className="space-y-2">
            {pendingOutgoing.map((s) => (
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
      {personBalances.length > 0 && (
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
      {personBalances.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Scale className="w-8 h-8 text-muted-foreground" />
            </div>
          </div>
          <p className="font-semibold">All settled up</p>
          <p className="text-sm text-muted-foreground">
            No outstanding balances across your shared budgets.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((pb) => {
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
      )}

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
          <a
            href="/shared"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Users className="w-4 h-4" />
            Go to Shared Budgets
          </a>
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

      {/* ── Confirm receipt dialog ── */}
      <Dialog
        open={!!confirmingId}
        onOpenChange={(o) => { if (!o) { setConfirmingId(null); setConfirmAccId('') } }}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Confirm Payment Received</DialogTitle>
          </DialogHeader>
          {confirmingSettlement && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                <div>
                  <p className="text-xs text-muted-foreground">Payment from</p>
                  <p className="text-sm font-semibold">{shortName(confirmingSettlement.payer_email)}</p>
                  {confirmingSettlement.note && (
                    <p className="text-xs text-muted-foreground mt-0.5">{confirmingSettlement.note}</p>
                  )}
                </div>
                <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  +{formatCurrency(confirmingSettlement.amount)}
                </span>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  Add to account <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <AccountChips
                  accounts={accounts}
                  value={confirmAccId}
                  onChange={setConfirmAccId}
                  noneLabel="Don't add"
                />
                {confirmAccId && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(confirmingSettlement.amount)} will be added to this account.
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11 rounded-xl border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => { handleReject(confirmingSettlement.id); setConfirmingId(null) }}
                >
                  Reject
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-11 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700"
                  disabled={isSavingConfirm}
                >
                  {isSavingConfirm ? 'Confirming…' : 'Confirm Received'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
