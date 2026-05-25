'use client'

import { useMemo } from 'react'
import { useExpenses } from '@/hooks/useExpenses'
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency, getMonthName, getCurrentMonth } from '@/utils/format'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts'
import { format, subMonths } from 'date-fns'
import { QuickAddButton } from '@/components/expenses/QuickAddButton'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-bold">{formatCurrency(payload[0].value)}</p>
      </div>
    )
  }
  return null
}

export default function AnalyticsPage() {
  const { month, year } = getCurrentMonth()
  const { expenses, addExpense } = useExpenses(month, year)

  const categoryData = useMemo(() => {
    const totals = expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount
      return acc
    }, {})

    const total = Object.values(totals).reduce((s, v) => s + v, 0)

    return Object.entries(totals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
        icon: CATEGORY_ICONS[category] || '📦',
        color: CATEGORY_COLORS[category] || '#6B7280',
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [expenses])

  const weeklyData = useMemo(() => {
    const weeks: Record<string, number> = {}
    expenses.forEach((e) => {
      const date = new Date(e.created_at)
      const weekStart = format(
        new Date(date.setDate(date.getDate() - date.getDay())),
        'MMM d'
      )
      weeks[weekStart] = (weeks[weekStart] || 0) + e.amount
    })
    return Object.entries(weeks)
      .map(([week, amount]) => ({ week, amount }))
      .slice(-6)
  }, [expenses])

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0)
  const topCategory = categoryData[0]

  const insights = useMemo(() => {
    const result: { icon: string; text: string; type: 'info' | 'warning' | 'success' }[] = []

    if (topCategory) {
      result.push({
        icon: topCategory.icon,
        text: `${topCategory.category} is your top category at ${topCategory.percentage.toFixed(0)}% of spending`,
        type: 'info',
      })
    }

    if (categoryData.length > 1) {
      const diff = categoryData[0].amount - categoryData[1].amount
      if (diff > 0) {
        result.push({
          icon: '📊',
          text: `You spent ${formatCurrency(diff)} more on ${categoryData[0].category} vs ${categoryData[1].category}`,
          type: 'info',
        })
      }
    }

    const today = new Date().getDate()
    const daily = today > 0 ? totalSpent / today : 0
    result.push({
      icon: '📅',
      text: `Your daily average spend this month is ${formatCurrency(daily)}`,
      type: daily > 1000 ? 'warning' : 'success',
    })

    return result
  }, [categoryData, totalSpent, topCategory])

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          {getMonthName(month)} {year} insights
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <h3 className="font-semibold text-sm">Spending by Category</h3>
        {categoryData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={categoryData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-5" />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                {categoryData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <h3 className="font-semibold text-sm">Category Breakdown</h3>
        <div className="space-y-3">
          {categoryData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No expenses recorded</p>
          ) : (
            categoryData.map((item) => (
              <div key={item.category} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span>{item.icon}</span>
                    <span className="font-medium">{item.category}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(item.amount)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">{item.percentage.toFixed(1)}%</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Spending Insights</h3>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add more expenses to see insights</p>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-xl bg-accent/50"
              >
                <span className="text-xl leading-none">{insight.icon}</span>
                <p className="text-sm leading-relaxed">{insight.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <QuickAddButton onAdd={addExpense} />
    </div>
  )
}
