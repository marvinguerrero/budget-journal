'use client'

import { SharedExpense, SharedExpenseSplit } from '@/types'
import { formatCurrency, formatShortDate } from '@/utils/format'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2 } from 'lucide-react'

interface Props {
  expense: SharedExpense
  splits: SharedExpenseSplit[]
  currentUserId: string
  isOwner: boolean
  canEditBudget: boolean
  onEdit: (expense: SharedExpense) => void
  onDelete: (id: string) => void
}

export function SharedExpenseItem({
  expense, splits, currentUserId, isOwner, canEditBudget, onEdit, onDelete,
}: Props) {
  const icon    = CATEGORY_ICONS[expense.category] ?? '📦'
  const color   = CATEGORY_COLORS[expense.category] ?? '#6b7280'
  const isMe    = expense.user_id === currentUserId
  const canEdit = isMe || isOwner || canEditBudget
  const canDelete = isMe || isOwner

  const payerId     = expense.paid_by_user_id ?? expense.user_id
  const payerEmail  = expense.paid_by_email   || expense.user_email
  const paidByMe    = payerId === currentUserId
  const payerLabel  = paidByMe ? 'You' : payerEmail.split('@')[0]

  // Splits where the debtor is not the payer — these are actual debts
  const debtSplits = splits.filter((s) => s.debtor_user_id !== payerId)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 p-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{expense.note || expense.category}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{expense.category}</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-xs text-muted-foreground">
              Paid by <span className="font-medium text-foreground">{payerLabel}</span>
            </span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-xs text-muted-foreground">{formatShortDate(expense.created_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-sm font-bold tabular-nums mr-1">{formatCurrency(expense.amount)}</span>
          {canEdit && (
            <Button
              type="button" variant="ghost" size="sm"
              className="w-7 h-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(expense)}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button
              type="button" variant="ghost" size="sm"
              className="w-7 h-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(expense.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Split breakdown */}
      {debtSplits.length > 0 && (
        <div className="px-3 pb-2.5 pt-0 border-t border-border/50 mt-0">
          <div className="flex flex-wrap gap-1.5 mt-2">
            {debtSplits.map((s) => {
              const isDebtor = s.debtor_user_id === currentUserId
              const label    = isDebtor ? 'You' : s.debtor_email.split('@')[0]
              return (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    isDebtor
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {label} <span className="font-bold tabular-nums">{formatCurrency(s.amount)}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
