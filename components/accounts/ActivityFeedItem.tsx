'use client'

import { ActivityEntry } from '@/hooks/useAccountActivity'
import { formatCurrency } from '@/utils/format'
import { CATEGORY_ICONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Trash2, TrendingDown, TrendingUp, ArrowLeftRight, ArrowRight } from 'lucide-react'

interface ActivityFeedItemProps {
  entry: ActivityEntry
  onDelete: (id: string, kind: ActivityEntry['kind']) => void
}

export function ActivityFeedItem({ entry, onDelete }: ActivityFeedItemProps) {
  const date = new Date(entry.date).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  const deleteBtn = (
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
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
          <TrendingDown className="w-4 h-4 text-rose-500" />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">Expense</span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
          </div>
          <p className="text-sm font-semibold truncate">{entry.note || entry.category}</p>
          <p className="text-[10px] text-muted-foreground">
            {icon} {entry.category} · {entry.account.emoji} {entry.account.name}
          </p>
        </div>
        <p className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400 flex-shrink-0">
          -{formatCurrency(entry.amount)}
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
