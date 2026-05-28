'use client'

import { formatCurrency } from '@/utils/format'
import { ArrowRight } from 'lucide-react'

export interface NetBalance {
  debtorId: string
  debtorEmail: string
  creditorId: string
  creditorEmail: string
  amount: number
}

interface Props {
  balances: NetBalance[]
  currentUserId: string
}

export function BalanceSummary({ balances, currentUserId }: Props) {
  if (balances.length === 0) return null

  const myBalances    = balances.filter((b) => b.debtorId === currentUserId || b.creditorId === currentUserId)
  const otherBalances = balances.filter((b) => b.debtorId !== currentUserId && b.creditorId !== currentUserId)

  const label = (id: string, email: string) =>
    id === currentUserId ? 'You' : email.split('@')[0]

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">Balances</p>

      <div className="space-y-2">
        {/* Current user's balances first */}
        {myBalances.map((b, i) => {
          const iOwe = b.debtorId === currentUserId
          return (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm ${
                iOwe
                  ? 'bg-amber-500/8 border border-amber-500/20'
                  : 'bg-emerald-500/8 border border-emerald-500/20'
              }`}
            >
              <span className={`font-medium ${iOwe ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {label(b.debtorId, b.debtorEmail)}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="font-medium text-foreground">
                {label(b.creditorId, b.creditorEmail)}
              </span>
              <span className={`ml-auto font-bold tabular-nums ${iOwe ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {formatCurrency(b.amount)}
              </span>
            </div>
          )
        })}

        {/* Other member balances */}
        {otherBalances.map((b, i) => (
          <div key={`other-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-muted/40">
            <span className="font-medium text-foreground">
              {label(b.debtorId, b.debtorEmail)}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-foreground">
              {label(b.creditorId, b.creditorEmail)}
            </span>
            <span className="ml-auto font-bold tabular-nums text-foreground">
              {formatCurrency(b.amount)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">Amounts are net across all shared expenses.</p>
    </div>
  )
}
