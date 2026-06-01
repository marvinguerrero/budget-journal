'use client'

import { AccountTransfer, FinancialAccount } from '@/types'
import { formatCurrency } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Trash2, ArrowRight } from 'lucide-react'

interface TransferItemProps {
  transfer: AccountTransfer
  accounts: FinancialAccount[]
  onDelete: (id: string) => void
}

export function TransferItem({ transfer, accounts, onDelete }: TransferItemProps) {
  const fromAcc = accounts.find((a) => a.id === transfer.from_account_id)
  const toAcc   = accounts.find((a) => a.id === transfer.to_account_id)

  const date = new Date(transfer.transferred_at)
  const dateStr = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const transferFee = Number(transfer.transfer_fee ?? 0)
  const totalDeducted = transfer.amount + transferFee

  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 text-sm font-medium flex-wrap">
          <span>{fromAcc?.emoji ?? '?'} {fromAcc?.name ?? 'Deleted'}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span>{toAcc?.emoji ?? '?'} {toAcc?.name ?? 'Deleted'}</span>
        </div>
        {transfer.note && (
          <p className="text-xs text-muted-foreground truncate">{transfer.note}</p>
        )}
        <p className="text-[10px] text-muted-foreground">
          Transferred: {formatCurrency(transfer.amount)}
          {transferFee > 0 ? ` · Fee: ${formatCurrency(transferFee)} · Total deducted: ${formatCurrency(totalDeducted)}` : ` · Fee: ${formatCurrency(0)}`}
        </p>
        <p className="text-[10px] text-muted-foreground">{dateStr}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <p className="text-base font-bold tabular-nums text-primary">
          {formatCurrency(transfer.amount)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(transfer.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
