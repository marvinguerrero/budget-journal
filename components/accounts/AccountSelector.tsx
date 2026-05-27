'use client'

import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/utils/format'

interface AccountSelectorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function AccountSelector({ value, onChange, className }: AccountSelectorProps) {
  const { accounts } = useFinancialAccounts()

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
                {formatCurrency(acc.balance)}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
