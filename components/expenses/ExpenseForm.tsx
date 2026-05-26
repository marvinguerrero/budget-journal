'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategorySelector } from './CategorySelector'
import { PaymentMethodSelector } from './PaymentMethodSelector'
import { ExpenseFormData } from '@/types'
import { format } from 'date-fns'

interface ExpenseFormProps {
  onSubmit: (data: ExpenseFormData) => Promise<void>
  onCancel: () => void
  initialData?: Partial<ExpenseFormData>
  isEditing?: boolean
}

export function ExpenseForm({ onSubmit, onCancel, initialData, isEditing }: ExpenseFormProps) {
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '')
  const [category, setCategory] = useState(initialData?.category || 'Food')
  const [note, setNote] = useState(initialData?.note || '')
  const [paymentMethod, setPaymentMethod] = useState(initialData?.payment_method || '')
  const [date, setDate] = useState(
    initialData?.created_at
      ? format(new Date(initialData.created_at), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd')
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        amount: parseFloat(amount),
        category,
        note: note.trim() || category,
        payment_method: paymentMethod || undefined,
        created_at: new Date(date + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="amount" className="text-sm font-semibold">Amount (₱)</Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-lg">₱</span>
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="pl-9 h-14 text-2xl font-bold text-center tracking-tight border-2 focus-visible:ring-0 focus-visible:border-primary rounded-xl"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Category</Label>
        <CategorySelector value={category} onChange={setCategory} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="note" className="text-sm font-semibold">Note</Label>
        <Input
          id="note"
          placeholder="e.g. Lunch with friends"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="date" className="text-sm font-semibold">Date</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">
          Payment Method{' '}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 rounded-xl"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 h-12 rounded-xl font-semibold"
          disabled={isSubmitting || !amount || parseFloat(amount) <= 0}
        >
          {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Add Expense'}
        </Button>
      </div>
    </form>
  )
}
