'use client'

import { Budget, Expense } from '@/types'
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import { cn } from '@/lib/utils'

interface BudgetProgressProps {
  budget: Budget
  expenses: Expense[]
}

export function BudgetProgress({ budget, expenses }: BudgetProgressProps) {
  const spent = expenses
    .filter((e) => e.category === budget.category)
    .reduce((sum, e) => sum + e.amount, 0)

  const percentage = Math.min((spent / budget.amount) * 100, 100)
  const remaining = budget.amount - spent
  const isOverspent = spent > budget.amount
  const icon = CATEGORY_ICONS[budget.category] || '📦'
  const color = CATEGORY_COLORS[budget.category] || '#6B7280'

  return (
    <div className="p-4 rounded-2xl border border-border bg-card space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ backgroundColor: color + '15' }}
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
        <div className="text-right">
          <p
            className={cn(
              'text-sm font-bold tabular-nums',
              isOverspent ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {isOverspent ? '-' : ''}{formatCurrency(Math.abs(remaining))}
          </p>
          <p className="text-xs text-muted-foreground">
            {isOverspent ? 'over budget' : 'remaining'}
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isOverspent ? 'bg-destructive' : ''
            )}
            style={{
              width: `${percentage}%`,
              backgroundColor: isOverspent ? undefined : color,
            }}
          />
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-muted-foreground">{percentage.toFixed(0)}% used</span>
          {isOverspent && (
            <span className="text-xs font-medium text-destructive">Over budget!</span>
          )}
        </div>
      </div>
    </div>
  )
}
