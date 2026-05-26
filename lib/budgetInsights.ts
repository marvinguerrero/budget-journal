import { Budget, Expense, Category } from '@/types'
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'

export type InsightStatus = 'over' | 'warning' | 'reached' | 'healthy' | 'unbudgeted'

export interface BudgetInsight {
  category: string
  icon: string
  color: string
  status: InsightStatus
  /** 0 when unbudgeted */
  budgetAmount: number
  spent: number
  /** negative when over budget */
  remaining: number
  /** 0 when unbudgeted */
  percentage: number
  /** > 0 only when over budget */
  overBy: number
  message: string
}

const STATUS_ORDER: Record<InsightStatus, number> = {
  over: 0,
  warning: 1,
  reached: 2,
  unbudgeted: 3,
  healthy: 4,
}

export function computeBudgetInsights(
  budgets: Budget[],
  expenses: Expense[],
  categories: Category[]
): BudgetInsight[] {
  const spentByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount
    return acc
  }, {})

  const budgetByCategory = Object.fromEntries(budgets.map((b) => [b.category, b]))
  const categoryMeta = Object.fromEntries(categories.map((c) => [c.name, c]))

  const allCategories = new Set([
    ...budgets.map((b) => b.category),
    ...expenses.map((e) => e.category),
  ])

  const insights: BudgetInsight[] = Array.from(allCategories).map((category) => {
    const budget = budgetByCategory[category]
    const spent = spentByCategory[category] || 0
    const meta = categoryMeta[category]
    const icon = meta?.icon || CATEGORY_ICONS[category] || '📦'
    const color = meta?.color || CATEGORY_COLORS[category] || '#6B7280'

    if (!budget) {
      return {
        category,
        icon,
        color,
        status: 'unbudgeted',
        budgetAmount: 0,
        spent,
        remaining: 0,
        percentage: 0,
        overBy: 0,
        message: `No budget set for ${category}. Consider adding one.`,
      }
    }

    const remaining = budget.amount - spent
    const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
    const overBy = Math.max(0, spent - budget.amount)

    let status: InsightStatus
    let message: string

    if (spent > budget.amount) {
      status = 'over'
      message = `${category} exceeded budget by ${formatCurrency(overBy)}.`
    } else if (percentage >= 100) {
      status = 'reached'
      message = `${category} budget fully used — no remaining budget.`
    } else if (percentage >= 80) {
      status = 'warning'
      message = `${percentage.toFixed(0)}% of ${category} budget already used.`
    } else {
      status = 'healthy'
      message = `${category} spending is within budget. ${formatCurrency(remaining)} remaining.`
    }

    return {
      category,
      icon,
      color,
      status,
      budgetAmount: budget.amount,
      spent,
      remaining,
      percentage,
      overBy,
      message,
    }
  })

  return insights.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
}
