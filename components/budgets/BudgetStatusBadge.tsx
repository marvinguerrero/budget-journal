import { InsightStatus } from '@/lib/budgetInsights'
import { cn } from '@/lib/utils'

interface Config {
  label: string
  className: string
  dotClass: string
}

const STATUS_CONFIG: Record<InsightStatus, Config> = {
  over: {
    label: 'Over Budget',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    dotClass: 'bg-rose-500',
  },
  warning: {
    label: 'Near Limit',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
  reached: {
    label: 'Within Limit',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
  healthy: {
    label: 'Within Budget',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
  unbudgeted: {
    label: 'No Budget',
    className: 'bg-muted text-muted-foreground',
    dotClass: 'bg-muted-foreground/60',
  },
}

interface BudgetStatusBadgeProps {
  status: InsightStatus
  className?: string
}

export function BudgetStatusBadge({ status, className }: BudgetStatusBadgeProps) {
  const { label, className: cls, dotClass } = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        cls,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} />
      {label}
    </span>
  )
}
