'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getBalancesData } from '@/services/balances'
import { computeGroupNetBalances } from '@/lib/balances'
import { formatCurrency } from '@/utils/format'
import { Scale, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export function DashboardBalanceCard() {
  const [owedToYou, setOwedToYou] = useState(0)
  const [youOwe,    setYouOwe]    = useState(0)
  const [hasData,   setHasData]   = useState(false)
  const [loaded,    setLoaded]    = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return

        const groups = await getBalancesData()
        if (cancelled) return

        let owed = 0
        let owe  = 0

        for (const gd of groups) {
          const balances = computeGroupNetBalances(gd.expenses, gd.splits, gd.settlements)
          for (const b of balances) {
            if (b.creditorId === user.id) owed += b.amount
            if (b.debtorId   === user.id) owe  += b.amount
          }
        }

        if (!cancelled) {
          setOwedToYou(owed)
          setYouOwe(owe)
          setHasData(owed > 0.005 || owe > 0.005)
          setLoaded(true)
        }
      } catch {
        // silent fail — balance card is non-critical
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  if (!loaded || !hasData) return null

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Balances</p>
        </div>
        <Link
          href="/balances"
          className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
        >
          View all
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {owedToYou > 0.005 && (
          <div className="rounded-xl bg-emerald-500/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-[10px] text-muted-foreground">You're owed</p>
            </div>
            <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(owedToYou)}
            </p>
          </div>
        )}
        {youOwe > 0.005 && (
          <div className="rounded-xl bg-amber-500/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <p className="text-[10px] text-muted-foreground">You owe</p>
            </div>
            <p className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {formatCurrency(youOwe)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
