'use client'

import { useState } from 'react'
import { Budget, Expense } from '@/types'
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import { BudgetStatusBadge } from './BudgetStatusBadge'
import { InsightStatus } from '@/lib/budgetInsights'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { BottomSheet } from '@/components/common/BottomSheet'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BudgetProgressProps {
  budget: Budget
  expenses: Expense[]
  onUpdate: (id: string, amount: number) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}

export function BudgetProgress({ budget, expenses, onUpdate, onDelete }: BudgetProgressProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [amount, setAmount] = useState(String(budget.amount))
  const [isSaving, setIsSaving] = useState(false)
  const isMobile = useIsMobile()

  const spent = expenses
    .filter((e) => e.category === budget.category)
    .reduce((sum, e) => sum + e.amount, 0)

  const rawPercentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
  const displayPercentage = Math.min(rawPercentage, 100)
  const remaining = budget.amount - spent
  const isOverspent = spent > budget.amount
  const isReached = !isOverspent && rawPercentage >= 100
  const isWarning = !isOverspent && !isReached && rawPercentage >= 80
  const icon = CATEGORY_ICONS[budget.category] || '📦'
  const color = CATEGORY_COLORS[budget.category] || '#6B7280'

  const status: InsightStatus = isOverspent ? 'over' : isReached ? 'reached' : isWarning ? 'warning' : 'healthy'
  const barColor = isOverspent ? '#EF4444' : (isReached || isWarning) ? '#F59E0B' : color

  const handleEdit = () => {
    setAmount(String(budget.amount))
    setEditOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!amount || parsed <= 0) return
    setIsSaving(true)
    try {
      await onUpdate(budget.id, parsed)
      setEditOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  const editForm = (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
          style={{ backgroundColor: color + '18' }}
        >
          {icon}
        </div>
        <p className="font-semibold text-sm">{budget.category}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="editBudgetAmount" className="text-sm font-semibold">
          Budget Amount (₱)
        </Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
            ₱
          </span>
          <Input
            id="editBudgetAmount"
            type="number"
            inputMode="decimal"
            min="1"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="pl-8 h-12 text-lg font-semibold rounded-xl"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Currently spending {formatCurrency(spent)} this month
        </p>
      </div>
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-11 rounded-xl"
          onClick={() => setEditOpen(false)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 h-11 rounded-xl font-semibold"
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Update Budget'}
        </Button>
      </div>
    </form>
  )

  return (
    <>
      <div className="p-4 rounded-2xl border border-border bg-card space-y-3 hover:shadow-sm transition-shadow group">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ backgroundColor: color + '15' }}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">{budget.category}</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(spent)} of {formatCurrency(budget.amount)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <BudgetStatusBadge status={status} />
            <div className="text-right hidden sm:block">
              <p
                className={cn(
                  'text-sm font-bold tabular-nums',
                  isOverspent
                    ? 'text-rose-600 dark:text-rose-400'
                    : (isReached || isWarning)
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {isOverspent ? '-' : ''}{formatCurrency(Math.abs(remaining))}
              </p>
              <p className="text-xs text-muted-foreground">
                {isOverspent ? 'over budget' : 'remaining'}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity rounded-lg hover:bg-accent outline-none lg:opacity-0 lg:group-hover:opacity-100">
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(budget.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${displayPercentage}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">{rawPercentage.toFixed(0)}% used</span>
            {isOverspent && (
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                +{formatCurrency(Math.abs(remaining))} over
              </span>
            )}
            {isReached && (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Reached!
              </span>
            )}
            {isWarning && (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Almost reached!
              </span>
            )}
          </div>
        </div>
      </div>

      {isMobile ? (
        <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit Budget">
          {editForm}
        </BottomSheet>
      ) : (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Edit Budget</DialogTitle>
            </DialogHeader>
            {editForm}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
