'use client'

import { useMemo } from 'react'
import { Budget, Expense, Category } from '@/types'
import { computeBudgetInsights } from '@/lib/budgetInsights'
import { BudgetInsightCard } from './BudgetInsightCard'
import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react'

interface InsightSummaryProps {
  budgets: Budget[]
  expenses: Expense[]
  categories: Category[]
}

export function InsightSummary({ budgets, expenses, categories }: InsightSummaryProps) {
  const insights = useMemo(
    () => computeBudgetInsights(budgets, expenses, categories),
    [budgets, expenses, categories]
  )

  if (insights.length === 0) return null

  const overCount = insights.filter((i) => i.status === 'over').length
  const warningCount = insights.filter((i) => i.status === 'warning').length
  const reachedCount = insights.filter((i) => i.status === 'reached').length
  const healthyCount = insights.filter((i) => i.status === 'healthy').length
  const unbudgetedCount = insights.filter((i) => i.status === 'unbudgeted').length

  // Dashboard shows actionable items first; healthy categories shown as a counter only
  const actionableInsights = insights.filter((i) => i.status !== 'healthy')
  const allHealthy = actionableInsights.length === 0

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Budget Insights</h3>
        </div>
        <a href="/budgets" className="text-xs text-primary font-medium hover:underline">
          View budgets →
        </a>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {overCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
            {overCount} over budget
          </span>
        )}
        {warningCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
            {warningCount} near limit
          </span>
        )}
        {reachedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
            {reachedCount} within limit
          </span>
        )}
        {unbudgetedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 flex-shrink-0" />
            {unbudgetedCount} untracked
          </span>
        )}
        {healthyCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            {healthyCount} healthy
          </span>
        )}
      </div>

      {/* Over-budget warning banner */}
      {overCount > 0 && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
            {overCount === 1
              ? '1 category is over budget this month.'
              : `${overCount} categories are over budget this month.`}
          </p>
        </div>
      )}

      {/* All-healthy banner */}
      {allHealthy && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            All categories are within budget this month. Great job!
          </p>
        </div>
      )}

      {/* Actionable insight cards */}
      {actionableInsights.length > 0 && (
        <div className="space-y-2">
          {actionableInsights.map((insight) => (
            <BudgetInsightCard key={insight.category} insight={insight} />
          ))}
        </div>
      )}
    </div>
  )
}
