'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategorySelector } from './CategorySelector'
import { ReceiptField } from './ReceiptField'
import { AccountSelector } from '@/components/accounts/AccountSelector'
import { Contact, ExpenseFormData } from '@/types'
import { getContacts } from '@/services/contacts'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'

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
  const [accountId, setAccountId] = useState(initialData?.account_id ?? '')
  const [obligationType, setObligationType] = useState<'normal' | 'owe_me' | 'i_owe'>(initialData?.obligation_type ?? 'normal')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState(initialData?.contact_id ?? '')
  const [date, setDate] = useState(
    initialData?.created_at
      ? format(new Date(initialData.created_at), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd')
  )
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getContacts()
      .then((data) => {
        if (cancelled) return
        setContacts(data)
        if (!contactId && initialData?.contact_name) {
          const existing = data.find((contact) =>
            contact.name.toLowerCase() === initialData.contact_name?.toLowerCase() ||
            (!!initialData.contact_email && contact.email?.toLowerCase() === initialData.contact_email.toLowerCase())
          )
          if (existing) setContactId(existing.id)
        }
      })
      .catch(() => { if (!cancelled) setContacts([]) })
    return () => { cancelled = true }
  }, [contactId, initialData?.contact_email, initialData?.contact_name])

  const isObligation = obligationType !== 'normal'
  const selectedContact = contacts.find((contact) => contact.id === contactId) ?? null
  const hasValidAmount = !!amount && parseFloat(amount) > 0
  const canSubmit = hasValidAmount
    && (!isObligation || !!selectedContact)
    && (obligationType !== 'owe_me' || !!accountId)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        amount: parseFloat(amount),
        category,
        note: note.trim() || category,
        account_id: obligationType === 'i_owe' ? null : accountId || null,
        created_at: new Date(date + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
        obligation_type: obligationType,
        contact_id: isObligation ? selectedContact?.id ?? null : undefined,
        contact_name: isObligation ? selectedContact?.name : undefined,
        contact_email: isObligation ? selectedContact?.email ?? null : undefined,
        contact_user_id: isObligation ? selectedContact?.linked_user_id ?? null : undefined,
        receipt_file: obligationType === 'i_owe' ? null : receiptFile,
        remove_receipt: obligationType === 'i_owe' ? false : removeReceipt,
      })
    } catch {
      // Submit handlers show the specific toast; keep the form open without
      // bubbling validation failures into the Next.js runtime overlay.
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
        <Label className="text-sm font-semibold">Expense Type</Label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'normal', label: 'Normal' },
            { value: 'owe_me', label: 'Owe Me' },
            { value: 'i_owe', label: 'I Owe' },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setObligationType(option.value)}
              className={cn(
                'h-10 rounded-xl border text-xs font-semibold transition-colors',
                obligationType === option.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
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

      {isObligation && (
        <div className="space-y-2">
          <Label htmlFor="contactId" className="text-sm font-semibold">
            Contact
          </Label>
          <select
            id="contactId"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">Select a contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}{contact.email ? ` · ${contact.email}` : ''}{contact.contact_type === 'registered' ? ' · registered' : ''}
              </option>
            ))}
          </select>
          {selectedContact ? (
            <p className="text-xs text-muted-foreground">
              {selectedContact.contact_type === 'registered'
                ? `Registered user${selectedContact.email ? ` · ${selectedContact.email}` : ''}`
                : 'External contact'}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add contacts under <Link href="/shared/contacts" className="text-primary font-medium">Shared → Contacts</Link>.
            </p>
          )}
        </div>
      )}

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

      {obligationType !== 'i_owe' && (
      <div className="space-y-2">
        <Label className="text-sm font-semibold">
          Account{' '}
          <span className="text-muted-foreground font-normal">
            {obligationType === 'owe_me' ? '(required)' : '(optional)'}
          </span>
        </Label>
        <AccountSelector value={accountId} onChange={setAccountId} />
      </div>
      )}

      {obligationType === 'i_owe' && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            No account will be deducted now because someone else paid. You can settle this from Balances later.
          </p>
        </div>
      )}

      {obligationType !== 'i_owe' && (
        <ReceiptField
          existingPath={initialData?.receipt_path ?? null}
          hasExistingReceipt={initialData?.has_receipt === true}
          selectedFile={receiptFile}
          removeExisting={removeReceipt}
          onFileChange={setReceiptFile}
          onRemoveExistingChange={setRemoveReceipt}
          disabled={isSubmitting}
        />
      )}

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
          disabled={isSubmitting || !canSubmit}
        >
          {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Add Expense'}
        </Button>
      </div>
    </form>
  )
}
