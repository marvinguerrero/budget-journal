'use client'

import { useState, useMemo } from 'react'
import { useExpenses, useBudgets } from '@/hooks/useExpenses'
import { BudgetProgress } from '@/components/budgets/BudgetProgress'
import { QuickAddButton } from '@/components/expenses/QuickAddButton'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCategories } from '@/hooks/useCategories'
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { formatCurrency, getMonthName, getCurrentMonth } from '@/utils/format'
import { computeBudgetInsights } from '@/lib/budgetInsights'
import { Plus, Target, AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export default function BudgetsPage() {
  const { month, year } = getCurrentMonth()
  const { expenses, addExpense } = useExpenses(month, year)
  const { budgets, isLoading, addBudget, updateBudget, deleteBudget } = useBudgets(month, year)
  const { categories } = useCategories()
  const [showAddBudget, setShowAddBudget] = useState(false)
  const [amount, setAmount] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const allCategories = categories.length > 0 ? categories : DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `d-${i}`, user_id: null, is_default: true, created_at: '' }))

  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0)
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalRemaining = totalBudget - totalSpent

  const coveredCategories = new Set(budgets.map((b) => b.category))
  const uncoveredCategories = allCategories.filter((c) => !coveredCategories.has(c.name))

  const unbudgetedInsights = useMemo(
    () =>
      computeBudgetInsights(budgets, expenses, allCategories).filter(
        (i) => i.status === 'unbudgeted' && i.spent > 0
      ),
    [budgets, expenses, allCategories]
  )

  const [category, setCategory] = useState(() => allCategories[0]?.name ?? DEFAULT_CATEGORIES[0].name)

  const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) return
    setIsSaving(true)
    try {
      await addBudget({
        category,
        amount: parseFloat(amount),
        month,
        year,
      })
      setShowAddBudget(false)
      setAmount('')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold">Budgets</h1>
        <p className="text-sm text-muted-foreground">
          {getMonthName(month)} {year}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Budget', value: formatCurrency(totalBudget), color: 'text-foreground' },
          { label: 'Total Spent', value: formatCurrency(totalSpent), color: 'text-rose-600 dark:text-rose-400' },
          {
            label: 'Remaining',
            value: formatCurrency(Math.abs(totalRemaining)),
            color: totalRemaining >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400',
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-3 text-center">
            <p className={`text-base font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Category Budgets</h2>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-xl text-xs gap-1.5"
          onClick={() => setShowAddBudget(true)}
          disabled={uncoveredCategories.length === 0}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Budget
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Target className="w-8 h-8 text-primary" />
            </div>
          </div>
          <p className="font-semibold">No budgets set</p>
          <p className="text-sm text-muted-foreground">
            Set category budgets to track spending limits
          </p>
          <Button
            className="rounded-xl"
            onClick={() => setShowAddBudget(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create your first budget
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((budget) => (
            <BudgetProgress
              key={budget.id}
              budget={budget}
              expenses={expenses}
              onUpdate={updateBudget}
              onDelete={deleteBudget}
            />
          ))}
        </div>
      )}

      {/* Unbudgeted spending section */}
      {!isLoading && unbudgetedInsights.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Unbudgeted Spending</h2>
          </div>
          <div className="space-y-2">
            {unbudgetedInsights.map((insight) => (
              <div
                key={insight.category}
                className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-card gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ backgroundColor: insight.color + '18' }}
                  >
                    {insight.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{insight.category}</p>
                    <p className="text-xs text-muted-foreground">No budget set</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="font-bold text-sm tabular-nums">{formatCurrency(insight.spent)}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg text-xs px-2"
                    onClick={() => {
                      setCategory(insight.category)
                      setShowAddBudget(true)
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Set
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showAddBudget} onOpenChange={setShowAddBudget}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Set Budget</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddBudget} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Category</Label>
              <Select value={category} onValueChange={(v: string | null) => v && setCategory(v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(uncoveredCategories.length > 0 ? uncoveredCategories : allCategories).map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>
                      {cat.icon} {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budgetAmount" className="text-sm font-semibold">Budget Amount (₱)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input
                  id="budgetAmount"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-8 h-12 text-lg font-semibold rounded-xl"
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11 rounded-xl"
                onClick={() => setShowAddBudget(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 h-11 rounded-xl font-semibold"
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Set Budget'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <QuickAddButton onAdd={addExpense} />
    </div>
  )
}
