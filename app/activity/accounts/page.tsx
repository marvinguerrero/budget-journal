'use client'

import { useState, useMemo } from 'react'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { useAccountActivity } from '@/hooks/useAccountActivity'
import { deleteExpense } from '@/services/expenses'
import { deleteIncomeEntry } from '@/services/incomeEntries'
import { deleteAccountTransfer } from '@/services/accountTransfers'
import { ACCOUNT_TYPES } from '@/lib/constants'
import { formatCurrency, getMonthName } from '@/utils/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { BottomSheet } from '@/components/common/BottomSheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ActivityFeedItem } from '@/components/accounts/ActivityFeedItem'
import { ActivityEntry } from '@/hooks/useAccountActivity'
import { Settings, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useIsMobile'
import { toast } from 'sonner'

const now = new Date()
const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: getMonthName(i + 1),
}))
const YEARS = ['2024', '2025', '2026']

export default function AccountsPage() {
  const { accounts, isLoading, totalBalance, reload: reloadAccounts } = useFinancialAccounts()

  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear]   = useState(String(now.getFullYear()))
  const [showTransfer, setShowTransfer] = useState(false)
  const isMobile = useIsMobile()

  const parsedMonth = month === 'all' ? undefined : Number(month)
  const parsedYear  = year  === 'all' ? undefined : Number(year)

  const { entries, isLoading: activityLoading, reload: reloadActivity } =
    useAccountActivity(parsedMonth, parsedYear)

  // ── Transfer form state ───────────────────────────────────────
  const [fromId,   setFromId]   = useState('')
  const [toId,     setToId]     = useState('')
  const [amount,   setAmount]   = useState('')
  const [note,     setNote]     = useState('')
  const [date,     setDate]     = useState(now.toISOString().slice(0, 10))
  const [isSaving, setIsSaving] = useState(false)

  const typeLabel = (type: string) =>
    ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type

  const resetForm = () => {
    setFromId(''); setToId(''); setAmount(''); setNote('')
    setDate(now.toISOString().slice(0, 10))
  }

  // ── Delete handler for all activity types ────────────────────
  const handleDelete = async (id: string, kind: ActivityEntry['kind']) => {
    try {
      if (kind === 'expense')  await deleteExpense(id)
      if (kind === 'income')   await deleteIncomeEntry(id)
      if (kind === 'transfer') await deleteAccountTransfer(id)
      toast.success('Entry removed')
      reloadAccounts()
      reloadActivity()
    } catch {
      toast.error('Failed to remove entry')
    }
  }

  // ── Transfer submit ───────────────────────────────────────────
  const availableTo = useMemo(() => accounts.filter((a) => a.id !== fromId), [accounts, fromId])

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!fromId || !toId || !amt || amt < 0.01 || fromId === toId) return
    setIsSaving(true)
    try {
      const { createAccountTransfer } = await import('@/services/accountTransfers')
      await createAccountTransfer({
        from_account_id: fromId,
        to_account_id: toId,
        amount: amt,
        note: note.trim(),
        transferred_at: new Date(date + 'T12:00:00').toISOString(),
      })
      toast.success('Transfer recorded!')
      setShowTransfer(false)
      resetForm()
      reloadAccounts()
      reloadActivity()
    } catch {
      toast.error('Failed to record transfer')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Summary stats ─────────────────────────────────────────────
  const stats = useMemo(() => {
    let totalOut = 0; let totalIn = 0
    for (const e of entries) {
      if (e.kind === 'expense') totalOut += e.amount
      if (e.kind === 'income')  totalIn  += e.amount
    }
    return { totalOut, totalIn }
  }, [entries])

  // ── Transfer form JSX ─────────────────────────────────────────
  const transferForm = (
    <form onSubmit={handleTransfer} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">From Account</Label>
        <Select value={fromId} onValueChange={(v: string | null) => { setFromId(v ?? ''); if (v === toId) setToId('') }}>
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Select source account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.emoji} {acc.name}
                <span className="text-xs text-muted-foreground ml-2">{formatCurrency(acc.balance)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">To Account</Label>
        <Select value={toId} onValueChange={(v: string | null) => setToId(v ?? '')}>
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Select destination account" />
          </SelectTrigger>
          <SelectContent>
            {availableTo.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.emoji} {acc.name}
                <span className="text-xs text-muted-foreground ml-2">{formatCurrency(acc.balance)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Amount (₱)</Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
          <Input
            type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="pl-8 h-12 text-lg font-semibold rounded-xl" required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Note (optional)</Label>
        <Input
          placeholder="e.g. savings top-up"
          value={note} onChange={(e) => setNote(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Date</Label>
        <Input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>

      <Button
        type="submit"
        disabled={isSaving || !fromId || !toId || fromId === toId}
        className="w-full h-12 rounded-xl text-base font-semibold mt-2"
      >
        {isSaving ? 'Transferring…' : 'Transfer'}
      </Button>
    </form>
  )

  return (
    <div className="p-4 lg:p-6 pb-32 lg:pb-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Accounts</h1>
          <p className="text-sm text-muted-foreground">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/settings">
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl gap-1.5 text-xs">
            <Settings className="w-3.5 h-3.5" />
            Manage
          </Button>
        </Link>
      </div>

      {/* Total Balance Card */}
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground space-y-1">
        <p className="text-xs font-medium opacity-75">Total Balance</p>
        <p className="text-3xl font-bold tabular-nums tracking-tight">
          {formatCurrency(totalBalance)}
        </p>
        <p className="text-xs opacity-60">{accounts.length} account{accounts.length !== 1 ? 's' : ''} combined</p>
      </div>

      {/* Accounts List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border space-y-3">
          <p className="text-4xl">🏦</p>
          <p className="font-semibold text-sm">No accounts yet</p>
          <p className="text-xs text-muted-foreground">Add accounts in Settings to start tracking balances</p>
          <Link href="/settings">
            <Button type="button" size="sm" className="mt-2 rounded-xl gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              Go to Settings
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {ACCOUNT_TYPES.map(({ value, label, emoji }) => {
            const group = accounts.filter((a) => a.type === value)
            if (group.length === 0) return null
            return (
              <div key={value} className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  {emoji} {label}
                </p>
                {group.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card"
                  >
                    <div className="w-10 h-10 rounded-xl bg-accent/60 flex items-center justify-center text-lg flex-shrink-0">
                      {acc.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{acc.name}</p>
                      <p className="text-[10px] text-muted-foreground">{typeLabel(acc.type)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn(
                        'text-base font-bold tabular-nums',
                        acc.balance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      )}>
                        {formatCurrency(acc.balance)}
                      </p>
                      <div className="flex items-center justify-end gap-0.5 mt-0.5">
                        {acc.balance >= 0
                          ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                          : <TrendingDown className="w-3 h-3 text-rose-500" />
                        }
                        <p className="text-[10px] text-muted-foreground">
                          {acc.balance >= 0 ? 'positive' : 'negative'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Account Activity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Account Activity</h2>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={month} onValueChange={(v: string | null) => setMonth(v ?? 'all')}>
            <SelectTrigger className="h-9 rounded-xl text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={(v: string | null) => setYear(v ?? 'all')}>
            <SelectTrigger className="h-9 rounded-xl text-xs w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {YEARS.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary row */}
        {!activityLoading && entries.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Total In</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                +{formatCurrency(stats.totalIn)}
              </p>
            </div>
            <div className="rounded-xl bg-rose-500/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Total Out</p>
              <p className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                -{formatCurrency(stats.totalOut)}
              </p>
            </div>
          </div>
        )}

        {activityLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-10 rounded-2xl border border-dashed border-border space-y-2">
            <p className="text-3xl">💳</p>
            <p className="font-semibold text-sm">No account activity yet</p>
            <p className="text-xs text-muted-foreground">
              Expenses, income, and transfers linked to accounts will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <ActivityFeedItem
                key={`${entry.kind}-${entry.id}`}
                entry={entry}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Transfer FAB */}
      {accounts.length >= 2 && (
        <button
          type="button"
          onClick={() => setShowTransfer(true)}
          title="New Transfer"
          className="fixed bottom-20 right-4 lg:bottom-8 lg:right-8 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
        >
          <ArrowLeftRight className="w-6 h-6" />
        </button>
      )}

      {/* Transfer modal */}
      {isMobile ? (
        <BottomSheet open={showTransfer} onClose={() => { setShowTransfer(false); resetForm() }} title="New Transfer">
          {transferForm}
        </BottomSheet>
      ) : (
        <Dialog open={showTransfer} onOpenChange={(o) => { if (!o) resetForm(); setShowTransfer(o) }}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>New Transfer</DialogTitle>
            </DialogHeader>
            {transferForm}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
