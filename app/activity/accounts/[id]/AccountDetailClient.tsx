'use client'

import { useState, useMemo } from 'react'
import { useAccountDetail, AccountDetailEntry } from '@/hooks/useAccountDetail'
import { ACCOUNT_TYPES, CATEGORY_ICONS, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, TrendingUp, ArrowLeftRight, CreditCard, ArrowRight, HandCoins,
} from 'lucide-react'
import Link from 'next/link'

type KindFilter = 'all' | 'expenses' | 'income' | 'transfers'

interface Props {
  accountId: string
}

function formatDateLabel(value?: string | null) {
  if (!value) return 'Not set'
  return new Date(value + (value.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function AccountDetailClient({ accountId }: Props) {
  const { account, entries, isLoading, moneyIn, moneyOut } = useAccountDetail(accountId)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')

  const filtered = useMemo(() =>
    kindFilter === 'all' ? entries :
    entries.filter((e) =>
      kindFilter === 'expenses'  ? (e.kind === 'expense' || e.kind === 'shared_expense') :
      kindFilter === 'income'    ? e.kind === 'income' :
      e.kind === 'transfer' || e.kind === 'personal_settlement'
    ),
    [entries, kindFilter]
  )

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-6 w-36 rounded-xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-10 rounded-xl" />
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
      </div>
    )
  }

  if (!account) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Link href="/activity/accounts" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to Accounts
        </Link>
        <div className="text-center py-16 space-y-2">
          <p className="text-4xl">🔍</p>
          <p className="font-semibold">Account not found</p>
        </div>
      </div>
    )
  }

  const isLiab    = account.category === 'liability'
  const typeInfo  = ACCOUNT_TYPES.find((t) => t.value === account.type)

  const balanceDisplay = isLiab
    ? account.balance < 0 ? `${formatCurrency(Math.abs(account.balance))} owed` : 'No debt'
    : formatCurrency(account.balance)

  const balanceColor = isLiab
    ? account.balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
    : account.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  const isCreditCard = account.type === 'credit'

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">

      {/* Back nav */}
      <Link
        href="/activity/accounts"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Accounts
      </Link>

      {/* Account header card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-accent/60 flex items-center justify-center text-2xl flex-shrink-0">
            {account.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{account.name}</h1>
            <p className="text-xs text-muted-foreground">
              {typeInfo?.label ?? account.type}
              {isLiab && <span className="ml-1.5 text-amber-500 font-medium">· Liability</span>}
            </p>
          </div>
        </div>

        {/* Balance + in/out stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-muted/60 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">{isLiab ? 'Current Debt' : 'Balance'}</p>
            <p className={cn('text-sm font-bold tabular-nums leading-tight', balanceColor)}>
              {balanceDisplay}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">{isLiab ? 'Paid Off' : 'Money In'}</p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">
              +{formatCurrency(moneyIn)}
            </p>
          </div>
          <div className="rounded-xl bg-rose-500/10 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">{isLiab ? 'Charged' : 'Money Out'}</p>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums leading-tight">
              -{formatCurrency(moneyOut)}
            </p>
          </div>
        </div>

        {isCreditCard && (
          <div className="rounded-xl bg-muted/60 p-3 space-y-2">
            <p className="text-xs font-semibold">Credit Card Details</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Credit Limit</p>
                <p className="font-semibold">{formatCurrency(account.credit_limit ?? 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Outstanding</p>
                <p className="font-semibold">{formatCurrency(Math.abs(account.balance))}</p>
              </div>
              <div>
                <p className="text-muted-foreground">SOA Day</p>
                <p className="font-semibold">{account.soa_day ?? '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Due Day</p>
                <p className="font-semibold">{account.due_day ?? '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Last Statement Date</p>
                <p className="font-semibold">{formatDateLabel(account.last_statement_date)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Kind filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
        {([
          { value: 'all',       label: 'All' },
          { value: 'expenses',  label: '💸 Expenses' },
          { value: 'income',    label: '💰 Income' },
          { value: 'transfers', label: '🔄 Transfers' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setKindFilter(value)}
            className={cn(
              'flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
              kindFilter === value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-accent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Activity feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Transaction History</h2>
          <p className="text-xs text-muted-foreground">{filtered.length} entries</p>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-14 rounded-2xl border border-dashed border-border space-y-2">
            <p className="text-3xl">📭</p>
            <p className="font-semibold text-sm">No activity yet</p>
            <p className="text-xs text-muted-foreground">
              {kindFilter === 'all'
                ? 'Transactions linked to this account will appear here'
                : `No ${kindFilter} recorded for this account`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <AccountDetailEntryItem
                key={`${entry.kind}-${entry.id}`}
                entry={entry}
                isLiab={isLiab}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AccountDetailEntryItem({ entry, isLiab }: { entry: AccountDetailEntry; isLiab: boolean }) {
  const date = new Date(entry.date).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  if (entry.kind === 'expense') {
    const icon  = CATEGORY_ICONS[entry.category] ?? '📦'
    const color = CATEGORY_COLORS[entry.category] ?? '#6B7280'
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
            isLiab ? 'bg-amber-500/10' : 'bg-rose-500/10'
          )}
        >
          {isLiab
            ? <CreditCard className="w-4 h-4 text-amber-500" />
            : <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
          }
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isLiab ? 'text-amber-500' : 'text-rose-500')}>
              {isLiab ? 'Credit Charge' : 'Expense'}
            </span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
          </div>
          <p className="text-sm font-semibold truncate">{entry.note || entry.category}</p>
          <p className="text-[10px] text-muted-foreground">
            <span style={{ backgroundColor: color + '20', borderRadius: 4, padding: '1px 5px' }}>
              {icon} {entry.category}
            </span>
          </p>
        </div>
        <p className={cn('text-sm font-bold tabular-nums flex-shrink-0', isLiab ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')}>
          {isLiab ? `+${formatCurrency(entry.amount)} debt` : `-${formatCurrency(entry.amount)}`}
        </p>
      </div>
    )
  }

  if (entry.kind === 'shared_expense') {
    const icon  = CATEGORY_ICONS[entry.category] ?? '📦'
    const color = CATEGORY_COLORS[entry.category] ?? '#6B7280'
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
            isLiab ? 'bg-amber-500/10' : 'bg-rose-500/10'
          )}
        >
          {isLiab
            ? <CreditCard className="w-4 h-4 text-amber-500" />
            : <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
          }
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isLiab ? 'text-amber-500' : 'text-rose-500')}>
              {isLiab ? 'Shared Charge' : 'Shared Expense'}
            </span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
          </div>
          <p className="text-sm font-semibold truncate">{entry.note || entry.category}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ backgroundColor: color + '20', borderRadius: 4, padding: '1px 5px' }}>
              {icon} {entry.category}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {entry.groupEmoji} {entry.groupName}
            </span>
          </div>
        </div>
        <p className={cn('text-sm font-bold tabular-nums flex-shrink-0', isLiab ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')}>
          {isLiab ? `+${formatCurrency(entry.amount)} debt` : `-${formatCurrency(entry.amount)}`}
        </p>
      </div>
    )
  }

  if (entry.kind === 'income') {
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Income</span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
          </div>
          <p className="text-sm font-semibold truncate">
            {entry.sourceEmoji} {entry.sourceName}
          </p>
          {entry.note && <p className="text-[10px] text-muted-foreground truncate">{entry.note}</p>}
        </div>
        <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 flex-shrink-0">
          +{formatCurrency(entry.amount)}
        </p>
      </div>
    )
  }

  if (entry.kind === 'personal_settlement') {
    const incoming = entry.direction === 'in'
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${incoming ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
          <HandCoins className={`w-4 h-4 ${incoming ? 'text-emerald-500' : 'text-amber-500'}`} />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${incoming ? 'text-emerald-500' : 'text-amber-500'}`}>
              Personal Settlement
            </span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
            {entry.status === 'pending_confirmation' && (
              <span className="text-[10px] text-blue-500">· Pending</span>
            )}
          </div>
          <p className="text-sm font-semibold truncate">
            {incoming ? `Received from ${entry.contactName}` : `Paid ${entry.contactName}`}
          </p>
          {entry.note && <p className="text-[10px] text-muted-foreground truncate">{entry.note}</p>}
        </div>
        <p className={`text-sm font-bold tabular-nums flex-shrink-0 ${incoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {incoming ? '+' : '-'}{formatCurrency(entry.amount)}
        </p>
      </div>
    )
  }

  // Transfer
  const isIn = entry.direction === 'in'
  const otherIsLiab = entry.otherAccount.category === 'liability'
  const transferFee = entry.transferFee
  const totalDeducted = entry.amount + transferFee

  let amountLabel: string
  let amountColor: string
  if (isLiab) {
    amountLabel = isIn ? `-${formatCurrency(entry.amount)} debt paid` : `+${formatCurrency(entry.amount)} debt`
    amountColor = isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  } else {
    amountLabel = isIn ? `+${formatCurrency(entry.amount)}` : `-${formatCurrency(entry.amount)}`
    amountColor = isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  }

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <ArrowLeftRight className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Transfer</span>
          <span className="text-[10px] text-muted-foreground">· {date}</span>
        </div>
        <div className="flex items-center gap-1 text-sm font-semibold flex-wrap">
          {isIn ? (
            <>
              <span>{entry.otherAccount.emoji} {entry.otherAccount.name}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-primary">This account</span>
            </>
          ) : (
            <>
              <span className="text-primary">This account</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span>{entry.otherAccount.emoji} {entry.otherAccount.name}</span>
              {otherIsLiab && <span className="text-[10px] text-amber-500 font-medium">(credit payment)</span>}
            </>
          )}
        </div>
        {entry.note && <p className="text-[10px] text-muted-foreground truncate">{entry.note}</p>}
        <p className="text-[10px] text-muted-foreground">
          Transferred: {formatCurrency(entry.amount)}
          {transferFee > 0 && !isIn
            ? ` · Fee: ${formatCurrency(transferFee)} · Total deducted: ${formatCurrency(totalDeducted)}`
            : ` · Fee: ${formatCurrency(transferFee)}`}
        </p>
      </div>
      <p className={cn('text-sm font-bold tabular-nums flex-shrink-0', amountColor)}>
        {amountLabel}
      </p>
    </div>
  )
}
