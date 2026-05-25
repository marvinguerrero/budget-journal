'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from 'recharts'
import { SpendingTrend } from '@/types'
import { formatCurrency } from '@/utils/format'

interface SpendingChartProps {
  data: SpendingTrend[]
}

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

export function SpendingChart({ data }: SpendingChartProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="font-semibold text-sm mb-4">Spending Trend</h3>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          No data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-5" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'currentColor', className: 'text-muted-foreground' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'currentColor', className: 'text-muted-foreground' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#3B82F6"
              strokeWidth={2.5}
              fill="url(#colorAmount)"
              dot={false}
              activeDot={{ r: 5, fill: '#3B82F6', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
