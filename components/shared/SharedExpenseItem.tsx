'use client'

import { SharedExpense } from '@/types'
import { formatCurrency, formatShortDate } from '@/utils/format'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

interface Props {
  expense: SharedExpense
  currentUserId: string
  isOwner: boolean
  onDelete: (id: string) => void
}

export function SharedExpenseItem({ expense, currentUserId, isOwner, onDelete }: Props) {
  const icon = CATEGORY_ICONS[expense.category] ?? '📦'
  const color = CATEGORY_COLORS[expense.category] ?? '#6b7280'
  const isMe = expense.user_id === currentUserId
  const canDelete = isMe || isOwner

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ backgroundColor: `${color}20` }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate">{expense.note || expense.category}</p>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{expense.category}</span>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <span className="text-xs text-muted-foreground">
            {isMe ? 'You' : expense.user_email.split('@')[0]}
          </span>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <span className="text-xs text-muted-foreground">{formatShortDate(expense.created_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-sm font-bold tabular-nums">{formatCurrency(expense.amount)}</span>
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-7 h-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(expense.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
