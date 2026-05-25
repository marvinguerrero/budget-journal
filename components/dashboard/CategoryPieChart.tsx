'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { CategoryBreakdown } from '@/types'
import { formatCurrency } from '@/utils/format'

interface CategoryPieChartProps {
  data: CategoryBreakdown[]
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg">
        <p className="text-sm font-semibold">{item.category}</p>
        <p className="text-sm">{formatCurrency(item.amount)}</p>
        <p className="text-xs text-muted-foreground">{item.percentage.toFixed(1)}%</p>
      </div>
    )
  }
  return null
}

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percentage }: any) => {
  if (percentage < 8) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="600">
      {`${percentage.toFixed(0)}%`}
    </text>
  )
}

export function CategoryPieChart({ data }: CategoryPieChartProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="font-semibold text-sm mb-4">By Category</h3>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          No expenses yet
        </div>
      ) : (
        <div className="space-y-3">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={3}
                dataKey="amount"
                labelLine={false}
                label={renderCustomLabel}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {data.slice(0, 4).map((item) => (
              <div key={item.category} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-muted-foreground">{item.icon} {item.category}</span>
                </div>
                <span className="text-xs font-semibold tabular-nums">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
