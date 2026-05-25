'use client'

import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string
  subtitle?: string
  icon: LucideIcon
  trend?: { value: string; positive: boolean }
  accent?: string
  className?: string
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accent = '#3B82F6',
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-border bg-card p-4 overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-0.5',
        className
      )}
    >
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 -translate-y-8 translate-x-8"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: accent + '15' }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: accent }} />
        </div>
        {trend && (
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              trend.positive
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            )}
          >
            {trend.positive ? '+' : ''}{trend.value}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-lg lg:text-2xl font-bold tracking-tight leading-tight">{value}</p>
        <p className="text-xs font-medium text-muted-foreground mt-0.5">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
