'use client'

import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { ACCOUNT_TYPES } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Settings, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function AccountsPage() {
  const { accounts, isLoading, totalBalance } = useFinancialAccounts()

  const typeLabel = (type: string) =>
    ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Accounts</h1>
          <p className="text-sm text-muted-foreground">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/settings">
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl gap-1.5 text-xs">
            <Settings className="w-3.5 h-3.5" />
            Manage
          </Button>
        </Link>
      </div>

      {/* Total Balance Card */}
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground space-y-1">
        <p className="text-xs font-medium opacity-75">Total Balance</p>
        <p className="text-3xl font-bold tabular-nums tracking-tight">
          {formatCurrency(totalBalance)}
        </p>
        <p className="text-xs opacity-60">{accounts.length} account{accounts.length !== 1 ? 's' : ''} combined</p>
      </div>

      {/* Accounts List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border space-y-3">
          <p className="text-4xl">🏦</p>
          <p className="font-semibold text-sm">No accounts yet</p>
          <p className="text-xs text-muted-foreground">Add accounts in Settings to start tracking balances</p>
          <Link href="/settings">
            <Button type="button" size="sm" className="mt-2 rounded-xl gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              Go to Settings
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Group by type */}
          {ACCOUNT_TYPES.map(({ value, label, emoji }) => {
            const group = accounts.filter((a) => a.type === value)
            if (group.length === 0) return null
            return (
              <div key={value} className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  {emoji} {label}
                </p>
                {group.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card"
                  >
                    <div className="w-10 h-10 rounded-xl bg-accent/60 flex items-center justify-center text-lg flex-shrink-0">
                      {acc.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{acc.name}</p>
                      <p className="text-[10px] text-muted-foreground">{typeLabel(acc.type)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn(
                        'text-base font-bold tabular-nums',
                        acc.balance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      )}>
                        {formatCurrency(acc.balance)}
                      </p>
                      <div className="flex items-center justify-end gap-0.5 mt-0.5">
                        {acc.balance >= 0
                          ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                          : <TrendingDown className="w-3 h-3 text-rose-500" />
                        }
                        <p className="text-[10px] text-muted-foreground">
                          {acc.balance >= 0 ? 'positive' : 'negative'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
