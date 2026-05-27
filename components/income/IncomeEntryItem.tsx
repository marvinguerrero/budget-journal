'use client'

import { IncomeEntry, IncomeSource } from '@/types'
import { formatCurrency, formatShortDate } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2 } from 'lucide-react'

interface Props {
  entry: IncomeEntry
  source: IncomeSource | undefined
  onEdit: (entry: IncomeEntry) => void
  onDelete: (id: string) => void
}

export function IncomeEntryItem({ entry, source, onEdit, onDelete }: Props) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ backgroundColor: `${source?.color ?? '#10B981'}20` }}
      >
        {source?.emoji ?? '💰'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{entry.note || source?.name || 'Income'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{source?.name ?? 'Income'}</span>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <span className="text-xs text-muted-foreground">{formatShortDate(entry.received_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mr-1">
          +{formatCurrency(entry.amount)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-7 h-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={() => onEdit(entry)}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-7 h-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(entry.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
