'use client'

import { useState, useMemo, useEffect } from 'react'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { useAccountActivity } from '@/hooks/useAccountActivity'
import { deleteExpense } from '@/services/expenses'
import { deleteIncomeEntry } from '@/services/incomeEntries'
import { deleteAccountTransfer } from '@/services/accountTransfers'
import { ACCOUNT_TYPES, getCurrencySymbol, isForeignCurrency } from '@/lib/constants'
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
import { FinancialAccount, SharedFinancialAccountSummary } from '@/types'
import { Settings, TrendingUp, TrendingDown, ArrowLeftRight, Share2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useIsMobile'
import { toast } from 'sonner'
import { createActionTrace, perfNow } from '@/lib/performance'
import { getSharedFinancialAccountsWithMe } from '@/services/sharedFinancialAccounts'

const now = new Date()
const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: getMonthName(i + 1),
}))
const YEARS = ['2024', '2025', '2026']

// Helper: display balance for an account (liability shown as positive debt)
function displayBalance(acc: FinancialAccount) {
  if (acc.category === 'liability') {
    return acc.balance < 0 ? `${formatCurrency(Math.abs(acc.balance))} owed` : 'No debt'
  }
  if (isForeignCurrency(acc.currency_code, acc.base_currency_code)) {
    const symbol = getCurrencySymbol(acc.currency_code)
    const native = (acc.foreign_balance ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    return `${symbol}${native}`
  }
  return formatCurrency(acc.balance)
}

function balanceColor(acc: FinancialAccount) {
  if (acc.category === 'liability') {
    return acc.balance < 0
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-emerald-600 dark:text-emerald-400'
  }
  return acc.balance >= 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400'
}

export default function AccountsPage() {
  const { accounts, isLoading, reload: reloadAccounts } = useFinancialAccounts()
  const [sharedWithMe, setSharedWithMe] = useState<SharedFinancialAccountSummary[]>([])

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'asset' | 'liability'>('all')
  const [typeFilter, setTypeFilter]         = useState('all')
  const [month, setMonth]                   = useState(String(now.getMonth() + 1))
  const [year,  setYear]                    = useState(String(now.getFullYear()))
  const [showTransfer, setShowTransfer]     = useState(false)
  const isMobile = useIsMobile()
  const typeLabel = (type: string) => ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type
  const typeEmoji = (type: string, category: FinancialAccount['category']) =>
    ACCOUNT_TYPES.find((t) => t.value === type)?.emoji ?? (category === 'liability' ? '💳' : '🏷️')

  useEffect(() => {
    let cancelled = false
    getSharedFinancialAccountsWithMe()
      .then((data) => {
        if (!cancelled) setSharedWithMe(data)
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load shared accounts')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Financial summary ─────────────────────────────────────────
  const assetAccounts     = useMemo(() => accounts.filter((a) => a.category !== 'liability'), [accounts])
  const liabilityAccounts = useMemo(() => accounts.filter((a) => a.category === 'liability'), [accounts])
  const totalAssets       = useMemo(() => assetAccounts.reduce((s, a) => s + a.balance, 0), [assetAccounts])
  const totalLiabilities  = useMemo(() => liabilityAccounts.reduce((s, a) => s + Math.abs(a.balance), 0), [liabilityAccounts])
  const netWorth          = totalAssets - totalLiabilities

  // ── Type summaries (filtered by category) ────────────────────
  const typeSummaries = useMemo(() => {
    const summaries = new Map<string, {
      value: string
      label: string
      emoji: string
      category: FinancialAccount['category']
      count: number
      total: number
    }>()

    for (const account of accounts) {
      if (categoryFilter !== 'all' && account.category !== categoryFilter) continue
      const existing = summaries.get(account.type)
      const total = account.category === 'liability' ? Math.abs(account.balance) : account.balance

      if (existing) {
        existing.count += 1
        existing.total += total
      } else {
        summaries.set(account.type, {
          value: account.type,
          label: typeLabel(account.type),
          emoji: typeEmoji(account.type, account.category),
          category: account.category,
          count: 1,
          total,
        })
      }
    }

    return Array.from(summaries.values())
  }, [accounts, categoryFilter])

  // ── Visible accounts ──────────────────────────────────────────
  const visibleAccounts = useMemo(() => {
    let list = accounts
    if (categoryFilter !== 'all') list = list.filter((a) =>
      a.category === categoryFilter
    )
    if (typeFilter !== 'all') list = list.filter((a) => a.type === typeFilter)
    return list
  }, [accounts, categoryFilter, typeFilter])

  const activeType = typeSummaries.find((t) => t.value === typeFilter)

  // ── Activity ─────────────────────────────────────────────────
  const parsedMonth = month === 'all' ? undefined : Number(month)
  const parsedYear  = year  === 'all' ? undefined : Number(year)

  const { entries, isLoading: activityLoading, reload: reloadActivity } =
    useAccountActivity(parsedMonth, parsedYear)

  const visibleEntries = useMemo(() => {
    if (typeFilter !== 'all') {
      return entries.filter((e) => {
        if (e.kind === 'expense' || e.kind === 'income' || e.kind === 'personal_settlement' || e.kind === 'settlement_history') return e.account.type === typeFilter
        return e.fromAccount.type === typeFilter || e.toAccount.type === typeFilter
      })
    }
    if (categoryFilter !== 'all') {
      return entries.filter((e) => {
        if (e.kind === 'expense' || e.kind === 'income' || e.kind === 'personal_settlement' || e.kind === 'settlement_history') {
          return e.account.category === categoryFilter
        }
        return true
      })
    }
    return entries
  }, [entries, typeFilter, categoryFilter])

  const stats = useMemo(() => {
    let totalOut = 0; let totalIn = 0
    for (const e of visibleEntries) {
      if (e.kind === 'expense') totalOut += e.amount
      if (e.kind === 'income')  totalIn  += e.amount
    }
    return { totalOut, totalIn }
  }, [visibleEntries])

  // ── Transfer form state ───────────────────────────────────────
  const [fromId,   setFromId]   = useState('')
  const [toId,     setToId]     = useState('')
  const [amount,   setAmount]   = useState('')
  const [destinationAmount, setDestinationAmount] = useState('')
  const [fee,      setFee]      = useState('0')
  const [note,     setNote]     = useState('')
  const [date,     setDate]     = useState(now.toISOString().slice(0, 10))
  const [isSaving, setIsSaving] = useState(false)

  const availableTo = useMemo(() => accounts.filter((a) => a.id !== fromId), [accounts, fromId])

  const fromAccount = useMemo(() => accounts.find((a) => a.id === fromId), [accounts, fromId])
  const toAccount   = useMemo(() => accounts.find((a) => a.id === toId), [accounts, toId])
  const fromIsForeign = !!fromAccount && isForeignCurrency(fromAccount.currency_code, fromAccount.base_currency_code)
  const toIsForeign   = !!toAccount   && isForeignCurrency(toAccount.currency_code, toAccount.base_currency_code)
  // v1 scope: only PHP (base) → foreign-currency exchanges are supported.
  const isExchange       = toIsForeign && !fromIsForeign
  const isUnsupportedFx  = fromIsForeign // foreign→PHP or foreign→foreign — not yet supported
  const exchangeRatePreview = isExchange && amount && destinationAmount && parseFloat(destinationAmount) > 0
    ? parseFloat(amount) / parseFloat(destinationAmount)
    : null

  const resetForm = () => {
    setFromId(''); setToId(''); setAmount(''); setDestinationAmount(''); setFee('0'); setNote('')
    setDate(now.toISOString().slice(0, 10))
  }

  const handleDelete = async (id: string, kind: ActivityEntry['kind']) => {
    try {
      if (kind === 'expense')  await deleteExpense(id)
      if (kind === 'income')   await deleteIncomeEntry(id)
      if (kind === 'transfer') await deleteAccountTransfer(id)
      toast.success('Entry removed')
      reloadAccounts()
      reloadActivity()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove entry')
    }
  }

  const handleTransfer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trace = createActionTrace('ui.account_transfer.submit')
    const validationStart = perfNow()
    const amt = parseFloat(amount)
    const transferFee = fee.trim() === '' ? 0 : parseFloat(fee)
    if (!fromId || !toId || !amt || amt < 0.01 || fromId === toId) {
      trace.measure('validation', validationStart, { valid: false, reason: 'invalid_accounts_or_amount' })
      trace.end()
      return
    }
    if (!Number.isFinite(transferFee)) {
      trace.measure('validation', validationStart, { valid: false, reason: 'invalid_fee' })
      trace.end()
      return
    }
    if (transferFee < 0) {
      trace.measure('validation', validationStart, { valid: false, reason: 'negative_fee' })
      trace.end()
      toast.error('Transfer fee cannot be negative.')
      return
    }
    if (isUnsupportedFx) {
      trace.measure('validation', validationStart, { valid: false, reason: 'unsupported_fx' })
      trace.end()
      toast.error('Transfers out of a foreign-currency account are not yet supported.')
      return
    }
    const destAmt = isExchange ? parseFloat(destinationAmount) : null
    if (isExchange && (!destAmt || destAmt <= 0)) {
      trace.measure('validation', validationStart, { valid: false, reason: 'missing_destination_amount' })
      trace.end()
      toast.error('Enter the amount received in the destination currency.')
      return
    }
    trace.measure('validation', validationStart, { valid: true })
    setIsSaving(true)
    try {
      const { createAccountTransfer } = await trace.step('import.account_transfer_service', () => import('@/services/accountTransfers'))
      await trace.step('service.create_account_transfer', () => createAccountTransfer({
        from_account_id: fromId,
        to_account_id: toId,
        amount: amt,
        destination_amount: destAmt,
        transfer_fee: transferFee,
        note: note.trim(),
        transferred_at: new Date(date + 'T12:00:00').toISOString(),
      }))
      toast.success('Transfer recorded!')
      setShowTransfer(false)
      resetForm()
      const refreshTrace = createActionTrace('accounts.background_refetch.after_transfer')
      void refreshTrace.step('refetch.accounts_and_activity', async () => {
        await Promise.all([reloadAccounts(), reloadActivity()])
      })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to refresh account activity')
        })
        .finally(() => refreshTrace.end())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record transfer')
    } finally {
      setIsSaving(false)
      trace.end()
    }
  }

  // ── Transfer form ─────────────────────────────────────────────
  const transferForm = (
    <form onSubmit={handleTransfer} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">From Account</Label>
        <Select value={fromId} onValueChange={(v: string | null) => { setFromId(v ?? ''); if (v === toId) setToId('') }}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select source account" /></SelectTrigger>
          <SelectContent>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.emoji} {acc.name} · {displayBalance(acc)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">To Account</Label>
        <Select value={toId} onValueChange={(v: string | null) => setToId(v ?? '')}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select destination account" /></SelectTrigger>
          <SelectContent>
            {availableTo.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.emoji} {acc.name} · {displayBalance(acc)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isUnsupportedFx && (
        <p className="text-xs text-destructive rounded-xl border border-destructive/30 bg-destructive/5 p-2.5">
          Transfers out of a foreign-currency account aren&apos;t supported yet — only PHP → foreign-currency
          exchanges are. Pick a PHP account as the source.
        </p>
      )}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">{isExchange ? 'From Amount (₱)' : 'Amount (₱)'}</Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="pl-8 h-12 text-lg font-semibold rounded-xl" required />
        </div>
      </div>
      {isExchange && toAccount && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            To Amount ({getCurrencySymbol(toAccount.currency_code)} {toAccount.currency_code})
          </Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
              {getCurrencySymbol(toAccount.currency_code)}
            </span>
            <Input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00"
              value={destinationAmount} onChange={(e) => setDestinationAmount(e.target.value)}
              className="pl-8 h-12 text-lg font-semibold rounded-xl" required />
          </div>
          {exchangeRatePreview !== null && (
            <p className="text-xs text-muted-foreground">
              Exchange rate: ₱{exchangeRatePreview.toFixed(4)} per {toAccount.currency_code} 1
              {toAccount.average_exchange_rate
                ? ` · current account average: ₱${toAccount.average_exchange_rate.toFixed(4)}`
                : ' · this will establish the account\'s starting average rate'}
            </p>
          )}
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Transfer Fee (₱)</Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
          <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
            value={fee} onChange={(e) => setFee(e.target.value)}
            className="pl-8 h-12 text-lg font-semibold rounded-xl" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Note (optional)</Label>
        <Input placeholder="e.g. credit card payment" value={note} onChange={(e) => setNote(e.target.value)} className="h-11 rounded-xl" />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl" />
      </div>
      <Button
        type="submit"
        disabled={isSaving || !fromId || !toId || fromId === toId || isUnsupportedFx || (isExchange && !destinationAmount)}
        className="w-full h-12 rounded-xl text-base font-semibold mt-2"
      >
        {isSaving ? 'Transferring…' : isExchange ? 'Exchange & Transfer' : 'Transfer'}
      </Button>
    </form>
  )

  return (
    <div className="p-4 lg:p-6 pb-32 lg:pb-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            {visibleAccounts.length} account{visibleAccounts.length !== 1 ? 's' : ''}
            {typeFilter !== 'all' && activeType ? ` · ${activeType.label}` : ''}
          </p>
        </div>
        <Link href="/settings">
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl gap-1.5 text-xs">
            <Settings className="w-3.5 h-3.5" />
            Manage
          </Button>
        </Link>
      </div>

      {/* Net Worth summary */}
      {!isLoading && accounts.length > 0 && (
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground space-y-3">
          <div className="space-y-0.5">
            <p className="text-xs font-medium opacity-75">Net Worth</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight">{formatCurrency(netWorth)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-primary-foreground/20">
            <div>
              <p className="text-[10px] font-medium opacity-60 mb-0.5">Assets</p>
              <p className="text-sm font-bold tabular-nums text-emerald-300">{formatCurrency(totalAssets)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium opacity-60 mb-0.5">Liabilities</p>
              <p className="text-sm font-bold tabular-nums text-rose-300">
                {totalLiabilities > 0 ? `-${formatCurrency(totalLiabilities)}` : formatCurrency(0)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Category + Type filter chips */}
      {!isLoading && accounts.length > 0 && (
        <div className="space-y-2">
          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
            {([
              { value: 'all',       label: '💳 All' },
              { value: 'asset',     label: '📦 Assets' },
              { value: 'liability', label: '💳 Liabilities' },
            ] as const).map(({ value, label }) => (
              <button key={value} type="button"
                onClick={() => { setCategoryFilter(value); setTypeFilter('all') }}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0',
                  categoryFilter === value && typeFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-accent text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
            {/* Type-level chips */}
            {typeSummaries.length > 0 && (
              <div className="w-px bg-border mx-1 flex-shrink-0" />
            )}
            {typeSummaries.map(({ value, label, emoji }) => (
              <button key={value} type="button"
                onClick={() => setTypeFilter(value)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0',
                  typeFilter === value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-accent text-muted-foreground hover:text-foreground'
                )}
              >
                {emoji} {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Type summary grid (All view only) */}
      {!isLoading && typeFilter === 'all' && typeSummaries.length > 1 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {typeSummaries.map(({ value, label, emoji, total, category }) => (
            <button key={value} type="button"
              onClick={() => setTypeFilter(value)}
              className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-card hover:bg-accent/50 active:scale-95 transition-all text-left"
            >
              <span className="text-xl flex-shrink-0">{emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className={cn(
                  'text-sm font-bold tabular-nums truncate',
                  category === 'liability' && total > 0 ? 'text-rose-600 dark:text-rose-400' : ''
                )}>
                  {category === 'liability' && total > 0 ? `${formatCurrency(total)} owed` : formatCurrency(total)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Accounts list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border space-y-3">
          <p className="text-4xl">🏦</p>
          <p className="font-semibold text-sm">No accounts yet</p>
          <p className="text-xs text-muted-foreground">Add accounts in Settings to start tracking balances</p>
          <Link href="/settings">
            <Button type="button" size="sm" className="mt-2 rounded-xl gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Go to Settings
            </Button>
          </Link>
        </div>
      ) : typeFilter !== 'all' ? (
        // Single-type flat list
        <div className="space-y-2">
          {visibleAccounts.length === 0 ? (
            <div className="text-center py-10 rounded-2xl border border-dashed border-border space-y-2">
              <p className="text-2xl">{activeType?.emoji}</p>
              <p className="text-sm font-semibold">No {activeType?.label} accounts</p>
            </div>
          ) : (
            visibleAccounts.map((acc) => <AccountCard key={acc.id} acc={acc} />)
          )}
        </div>
      ) : (
        // Grouped: Assets then Liabilities
        <div className="space-y-4">
          {assetAccounts.length > 0 && (
              <AccountGroup
                label="Assets"
                accounts={categoryFilter === 'liability' ? [] : assetAccounts}
                totalLabel={formatCurrency(totalAssets)}
                totalColor="text-emerald-600 dark:text-emerald-400"
              />
          )}
          {liabilityAccounts.length > 0 && categoryFilter !== 'asset' && (
              <AccountGroup
                label="Liabilities"
                accounts={liabilityAccounts}
                totalLabel={totalLiabilities > 0 ? `${formatCurrency(totalLiabilities)} owed` : 'No debt'}
                totalColor={totalLiabilities > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}
              />
          )}
        </div>
      )}

      {sharedWithMe.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Share2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold">Shared With Me</h2>
          </div>
          <div className="space-y-2">
            {sharedWithMe.map((share) => (
              <SharedAccountCard key={share.share_id} share={share} />
            ))}
          </div>
        </div>
      )}

      {/* Account Activity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Account Activity</h2>
          {(typeFilter !== 'all' && activeType) && (
            <span className="text-xs text-muted-foreground">{activeType.emoji} {activeType.label} only</span>
          )}
        </div>

        <div className="flex gap-2">
          <Select value={month} onValueChange={(v: string | null) => setMonth(v ?? 'all')}>
            <SelectTrigger className="h-9 rounded-xl text-xs flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={(v: string | null) => setYear(v ?? 'all')}>
            <SelectTrigger className="h-9 rounded-xl text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!activityLoading && visibleEntries.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Total In</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+{formatCurrency(stats.totalIn)}</p>
            </div>
            <div className="rounded-xl bg-rose-500/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Total Out</p>
              <p className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">-{formatCurrency(stats.totalOut)}</p>
            </div>
          </div>
        )}

        {activityLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="text-center py-10 rounded-2xl border border-dashed border-border space-y-2">
            <p className="text-3xl">💳</p>
            <p className="font-semibold text-sm">No account activity yet</p>
            <p className="text-xs text-muted-foreground">Expenses, income, and transfers linked to accounts will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleEntries.map((entry) => (
              <ActivityFeedItem key={`${entry.kind}-${entry.id}`} entry={entry} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* Transfer FAB */}
      {accounts.length >= 2 && (
        <button type="button" onClick={() => setShowTransfer(true)} title="New Transfer"
          className="fixed bottom-20 right-4 lg:bottom-8 lg:right-8 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition-all">
          <ArrowLeftRight className="w-6 h-6" />
        </button>
      )}

      {isMobile ? (
        <BottomSheet open={showTransfer} onClose={() => { setShowTransfer(false); resetForm() }} title="New Transfer">
          {transferForm}
        </BottomSheet>
      ) : (
        <Dialog open={showTransfer} onOpenChange={(o) => { if (!o) resetForm(); setShowTransfer(o) }}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader><DialogTitle>New Transfer</DialogTitle></DialogHeader>
            {transferForm}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function AccountGroup({
  label, accounts, totalLabel, totalColor,
}: {
  label: string
  accounts: FinancialAccount[]
  totalLabel: string
  totalColor: string
}) {
  if (accounts.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn('text-[10px] font-semibold tabular-nums', totalColor)}>{totalLabel}</p>
      </div>
      {accounts.map((acc) => <AccountCard key={acc.id} acc={acc} />)}
    </div>
  )
}

function displaySharedBalance(share: SharedFinancialAccountSummary) {
  if (!share.can_view_balance || share.balance === null) return 'Hidden'
  if (share.account_category === 'liability') {
    return share.balance < 0 ? `${formatCurrency(Math.abs(share.balance))} owed` : 'No debt'
  }
  return formatCurrency(share.balance)
}

function SharedAccountCard({ share }: { share: SharedFinancialAccountSummary }) {
  const isLiab = share.account_category === 'liability'
  const typeInfo = ACCOUNT_TYPES.find((t) => t.value === share.account_type)
  return (
    <Link href={`/activity/accounts/${share.account_id}`} className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-accent/30 active:scale-[0.99] transition-all">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg flex-shrink-0">
        {share.account_emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{share.account_name}</p>
        <p className="text-[10px] text-muted-foreground">
          Owner: {share.owner_email ?? 'Account owner'} · {typeInfo?.label ?? share.account_type}
          {isLiab && <span className="ml-1 text-amber-500">· Liability</span>}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={cn('text-sm font-bold tabular-nums', share.can_view_balance ? (isLiab ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') : 'text-muted-foreground')}>
          {displaySharedBalance(share)}
        </p>
        <p className="text-[10px] text-muted-foreground capitalize">{share.permission_level}</p>
      </div>
    </Link>
  )
}

function AccountCard({ acc }: { acc: FinancialAccount }) {
  const isLiab = acc.category === 'liability'
  const isForeign = isForeignCurrency(acc.currency_code, acc.base_currency_code)
  const typeInfo = ACCOUNT_TYPES.find((t) => t.value === acc.type)
  return (
    <Link href={`/activity/accounts/${acc.id}`} className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-accent/30 active:scale-[0.99] transition-all">
      <div className="w-10 h-10 rounded-xl bg-accent/60 flex items-center justify-center text-lg flex-shrink-0">
        {acc.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{acc.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {typeInfo?.label ?? acc.type}
          {isLiab && <span className="ml-1 text-amber-500">· Liability</span>}
          {isForeign && <span className="ml-1 text-primary">· {acc.currency_code}</span>}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={cn('text-base font-bold tabular-nums', balanceColor(acc))}>
          {displayBalance(acc)}
        </p>
        {isForeign && (
          <p className="text-[10px] text-muted-foreground">
            ≈ {formatCurrency(acc.balance)}
          </p>
        )}
        <div className="flex items-center justify-end gap-0.5 mt-0.5">
          {isLiab
            ? acc.balance < 0
              ? <TrendingDown className="w-3 h-3 text-rose-500" />
              : <TrendingUp className="w-3 h-3 text-emerald-500" />
            : acc.balance >= 0
              ? <TrendingUp className="w-3 h-3 text-emerald-500" />
              : <TrendingDown className="w-3 h-3 text-rose-500" />
          }
          <p className="text-[10px] text-muted-foreground">
            {isLiab ? (acc.balance < 0 ? 'in debt' : 'clear') : (acc.balance >= 0 ? 'positive' : 'overdrawn')}
          </p>
        </div>
      </div>
    </Link>
  )
}
