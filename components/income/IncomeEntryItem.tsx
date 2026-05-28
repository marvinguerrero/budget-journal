'use client'

import { IncomeEntry, IncomeSource } from '@/types'
import { formatCurrency, formatShortDate } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, CheckCircle2, Clock } from 'lucide-react'

interface Props {
  entry: IncomeEntry
  source: IncomeSource | undefined
  onEdit: (entry: IncomeEntry) => void
  onDelete: (id: string) => void
  onMarkReceived?: (id: string) => void
}

export function IncomeEntryItem({ entry, source, onEdit, onDelete, onMarkReceived }: Props) {
  const isExpected = entry.status === 'expected'

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border bg-card ${isExpected ? 'border-amber-500/30' : 'border-border'}`}>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ backgroundColor: `${source?.color ?? '#10B981'}20`, opacity: isExpected ? 0.7 : 1 }}
      >
        {source?.emoji ?? '💰'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-semibold truncate ${isExpected ? 'text-muted-foreground' : ''}`}>
            {entry.note || source?.name || 'Income'}
          </p>
          {isExpected ? (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
              <Clock className="w-2.5 h-2.5" />
              Expected
            </span>
          ) : (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Received
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{source?.name ?? 'Income'}</span>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <span className="text-xs text-muted-foreground">{formatShortDate(entry.received_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className={`text-sm font-bold tabular-nums mr-1 ${isExpected ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          +{formatCurrency(entry.amount)}
        </span>
        {isExpected && onMarkReceived && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Mark as received"
            className="w-7 h-7 p-0 rounded-lg text-amber-500 hover:text-emerald-500 hover:bg-emerald-500/10"
            onClick={() => onMarkReceived(entry.id)}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </Button>
        )}
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
