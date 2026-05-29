'use client'

import { ActivityEntry } from '@/hooks/useAccountActivity'
import { formatCurrency } from '@/utils/format'
import { CATEGORY_ICONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Trash2, TrendingDown, TrendingUp, ArrowLeftRight, ArrowRight, CreditCard, HandCoins } from 'lucide-react'
import { isLiabilityType } from '@/lib/constants'

interface ActivityFeedItemProps {
  entry: ActivityEntry
  onDelete: (id: string, kind: ActivityEntry['kind']) => void
}

export function ActivityFeedItem({ entry, onDelete }: ActivityFeedItemProps) {
  const date = new Date(entry.date).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  const deleteBtn = entry.kind === 'personal_settlement' ? null : (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="w-7 h-7 text-muted-foreground hover:text-destructive flex-shrink-0"
      onClick={() => onDelete(entry.id, entry.kind)}
    >
      <Trash2 className="w-3.5 h-3.5" />
    </Button>
  )

  if (entry.kind === 'expense') {
    const icon = CATEGORY_ICONS[entry.category] ?? '📦'
    const isLiability = isLiabilityType(entry.account.type)
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isLiability ? 'bg-amber-500/10' : 'bg-rose-500/10'}`}>
          {isLiability
            ? <CreditCard className="w-4 h-4 text-amber-500" />
            : <TrendingDown className="w-4 h-4 text-rose-500" />
          }
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${isLiability ? 'text-amber-500' : 'text-rose-500'}`}>
              {isLiability ? 'Credit Charge' : 'Expense'}
            </span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
          </div>
          <p className="text-sm font-semibold truncate">{entry.note || entry.category}</p>
          <p className="text-[10px] text-muted-foreground">
            {icon} {entry.category} · {entry.account.emoji} {entry.account.name}
          </p>
        </div>
        <p className={`text-sm font-bold tabular-nums flex-shrink-0 ${isLiability ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {isLiability ? `+${formatCurrency(entry.amount)} debt` : `-${formatCurrency(entry.amount)}`}
        </p>
        {deleteBtn}
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
          <p className="text-[10px] text-muted-foreground">
            {entry.account.emoji} {entry.account.name}
            {entry.note ? ` · ${entry.note}` : ''}
          </p>
        </div>
        <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 flex-shrink-0">
          +{formatCurrency(entry.amount)}
        </p>
        {deleteBtn}
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
          <p className="text-[10px] text-muted-foreground">
            {entry.account.emoji} {entry.account.name}
            {entry.note ? ` · ${entry.note}` : ''}
          </p>
        </div>
        <p className={`text-sm font-bold tabular-nums flex-shrink-0 ${incoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {incoming ? '+' : '-'}{formatCurrency(entry.amount)}
        </p>
      </div>
    )
  }

  if (entry.kind === 'settlement_history') {
    const reversed = entry.event === 'reversed'
    const outgoing = entry.direction === 'out'
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${reversed ? 'bg-blue-500/10' : 'bg-emerald-500/10'}`}>
          <HandCoins className={`w-4 h-4 ${reversed ? 'text-blue-500' : 'text-emerald-500'}`} />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${reversed ? 'text-blue-500' : 'text-emerald-500'}`}>
              {reversed ? 'Confirmation Reversed' : 'Payment Confirmed'}
            </span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
          </div>
          <p className="text-sm font-semibold truncate">
            {reversed
              ? `Confirmation reversed ${outgoing ? `for ${entry.counterpartyName}` : `from ${entry.counterpartyName}`}`
              : outgoing ? `Paid ${entry.counterpartyName}` : `Confirmed payment from ${entry.counterpartyName}`}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {entry.fromLabel && entry.toLabel
              ? `${entry.fromLabel} → ${entry.toLabel}`
              : `${entry.account.emoji} ${entry.account.name}`}
            {entry.note ? ` · ${entry.note}` : ''}
          </p>
        </div>
        <p className={`text-sm font-bold tabular-nums flex-shrink-0 ${
          reversed
            ? 'text-blue-600 dark:text-blue-400'
            : outgoing ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
        }`}>
          {!reversed && (outgoing ? '-' : '+')}{formatCurrency(entry.amount)}
        </p>
      </div>
    )
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
          <span>{entry.fromAccount.emoji} {entry.fromAccount.name}</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span>{entry.toAccount.emoji} {entry.toAccount.name}</span>
        </div>
        {entry.note && (
          <p className="text-[10px] text-muted-foreground truncate">{entry.note}</p>
        )}
      </div>
      <p className="text-sm font-bold tabular-nums text-primary flex-shrink-0">
        {formatCurrency(entry.amount)}
      </p>
      {deleteBtn}
    </div>
  )
}
