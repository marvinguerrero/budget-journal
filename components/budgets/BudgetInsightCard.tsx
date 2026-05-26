'use client'

import { BudgetInsight } from '@/lib/budgetInsights'
import { BudgetStatusBadge } from './BudgetStatusBadge'
import { formatCurrency } from '@/utils/format'

interface BudgetInsightCardProps {
  insight: BudgetInsight
}

const PROGRESS_BAR_COLOR: Record<string, string | undefined> = {
  over: '#EF4444',
  warning: '#F59E0B',
}

export function BudgetInsightCard({ insight }: BudgetInsightCardProps) {
  const {
    category,
    icon,
    color,
    status,
    budgetAmount,
    spent,
    remaining,
    percentage,
    overBy,
    message,
  } = insight

  const showBar = status !== 'unbudgeted'
  const progressWidth = Math.min(percentage, 100)
  const barColor = PROGRESS_BAR_COLOR[status] ?? color

  return (
    <div className="p-4 rounded-2xl border border-border bg-card space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ backgroundColor: color + '18' }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">{category}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{message}</p>
          </div>
        </div>
        <BudgetStatusBadge status={status} className="flex-shrink-0 mt-0.5" />
      </div>

      {showBar && (
        <div className="space-y-1.5">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressWidth}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">{formatCurrency(spent)} spent</span>
            {status === 'over' ? (
              <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                +{formatCurrency(overBy)} over
              </span>
            ) : (
              <span className="tabular-nums">{formatCurrency(budgetAmount)} budget</span>
            )}
          </div>
        </div>
      )}

      {status === 'unbudgeted' && spent > 0 && (
        <div className="flex justify-between items-center text-xs pt-0.5">
          <span className="text-muted-foreground">Total untracked spending</span>
          <span className="font-semibold tabular-nums">{formatCurrency(spent)}</span>
        </div>
      )}
    </div>
  )
}
