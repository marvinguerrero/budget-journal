'use client'

import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/utils/format'
import { isLiabilityType } from '@/lib/constants'

interface AccountSelectorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function AccountSelector({ value, onChange, className }: AccountSelectorProps) {
  const { accounts } = useFinancialAccounts()

  const displayBalance = (acc: { type: string; balance: number }) =>
    isLiabilityType(acc.type)
      ? acc.balance < 0
        ? `${formatCurrency(Math.abs(acc.balance))} owed`
        : 'No debt'
      : formatCurrency(acc.balance)

  return (
    <Select value={value} onValueChange={(v: string | null) => onChange(v ?? '')}>
      <SelectTrigger className={className ?? 'h-11 rounded-xl'}>
        <SelectValue placeholder="No account" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">No account</SelectItem>
        {accounts.map((acc) => (
          <SelectItem key={acc.id} value={acc.id}>
            <span className="flex items-center gap-2">
              {acc.emoji} {acc.name}
              <span className="text-xs text-muted-foreground ml-1">
                {displayBalance(acc)}
                {isLiabilityType(acc.type) && ' · Liability'}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
