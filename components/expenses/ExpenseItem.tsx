'use client'

import { useState } from 'react'
import { Expense, ExpenseFormData } from '@/types'
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency, formatShortDate } from '@/utils/format'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExpenseForm } from './ExpenseForm'
import { BottomSheet } from '@/components/common/BottomSheet'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FinancialAccount } from '@/types'

interface ExpenseItemProps {
  expense: Expense
  onUpdate: (id: string, data: Partial<ExpenseFormData>) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  accounts?: FinancialAccount[]
}

export function ExpenseItem({ expense, onUpdate, onDelete, accounts = [] }: ExpenseItemProps) {
  const [editOpen, setEditOpen] = useState(false)
  const isMobile = useIsMobile()
  const icon = CATEGORY_ICONS[expense.category] || '📦'
  const color = CATEGORY_COLORS[expense.category] || '#6B7280'
  const account = expense.account_id ? accounts.find((a) => a.id === expense.account_id) : null

  const handleUpdate = async (data: ExpenseFormData) => {
    await onUpdate(expense.id, data)
    setEditOpen(false)
  }

  const handleDelete = async () => {
    await onDelete(expense.id)
  }

  return (
    <>
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border hover:border-border/80 hover:shadow-sm transition-all duration-200 group">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ backgroundColor: color + '15' }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{expense.note || expense.category}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-xs px-1.5 py-0.5 rounded-md font-medium"
              style={{ backgroundColor: color + '15', color }}
            >
              {expense.category}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatShortDate(expense.created_at)}
            </span>
            {expense.payment_method && (
              <span className="text-xs text-muted-foreground">· {expense.payment_method}</span>
            )}
            {account && (
              <span className="text-xs text-muted-foreground">· {account.emoji} {account.name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tabular-nums">
            {formatCurrency(expense.amount)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity rounded-lg hover:bg-accent outline-none lg:opacity-0 lg:group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isMobile ? (
        <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit Expense">
          <ExpenseForm
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
            initialData={{
              amount: expense.amount,
              category: expense.category,
              note: expense.note,
              payment_method: expense.payment_method,
              account_id: expense.account_id,
              created_at: expense.created_at,
            }}
            isEditing
          />
        </BottomSheet>
      ) : (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Edit Expense</DialogTitle>
            </DialogHeader>
            <ExpenseForm
              onSubmit={handleUpdate}
              onCancel={() => setEditOpen(false)}
              initialData={{
                amount: expense.amount,
                category: expense.category,
                note: expense.note,
                payment_method: expense.payment_method,
                created_at: expense.created_at,
              }}
              isEditing
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
