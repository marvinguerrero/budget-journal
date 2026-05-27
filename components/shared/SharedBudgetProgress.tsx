'use client'

import { useMemo } from 'react'
import { SharedBudget, SharedExpense } from '@/types'
import { formatCurrency } from '@/utils/format'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

interface Props {
  budget: SharedBudget
  expenses: SharedExpense[]
  canDelete: boolean
  onDelete: (id: string) => void
}

export function SharedBudgetProgress({ budget, expenses, canDelete, onDelete }: Props) {
  const spent = useMemo(
    () => expenses.filter((e) => e.category === budget.category).reduce((s, e) => s + e.amount, 0),
    [expenses, budget.category]
  )

  const percentage = budget.amount > 0 ? Math.min((spent / budget.amount) * 100, 100) : 0
  const isOver = spent > budget.amount
  const isReached = !isOver && percentage >= 100
  const isWarning = !isOver && !isReached && percentage >= 80

  const barColor = isOver || isReached
    ? 'bg-rose-500'
    : isWarning
    ? 'bg-amber-500'
    : 'bg-emerald-500'

  const icon = CATEGORY_ICONS[budget.category] ?? '📦'
  const color = CATEGORY_COLORS[budget.category] ?? '#6b7280'
  const remaining = budget.amount - spent

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
            style={{ backgroundColor: `${color}20` }}
          >
            {icon}
          </div>
          <div>
            <p className="font-semibold text-sm">{budget.category}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(spent)} of {formatCurrency(budget.amount)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${isOver ? 'text-rose-500' : remaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {isOver ? `-${formatCurrency(spent - budget.amount)}` : formatCurrency(remaining)}
          </span>
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-7 h-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(budget.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {isOver ? 'Over by ' + formatCurrency(spent - budget.amount) : isReached ? 'Reached!' : isWarning ? 'Almost reached!' : `${Math.round(percentage)}% used`}
          </span>
          <span>{Math.round(isOver ? (spent / budget.amount) * 100 : percentage)}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${isOver ? 100 : percentage}%` }}
          />
        </div>
      </div>
    </div>
  )
}
