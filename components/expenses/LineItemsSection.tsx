'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { CategorySelector } from './CategorySelector'
import {
  getExpenseLineItems, createExpenseLineItem, updateExpenseLineItem,
  deleteExpenseLineItem, computeAllocation,
} from '@/services/expenseLineItems'
import { getContacts } from '@/services/contacts'
import {
  Contact, Expense, ExpenseLineItem, ExpenseLineItemFormData,
  ExpenseParticipant, PersonalObligation, LineItemAssignedType,
  ExpenseParticipantFormData,
} from '@/types'
import { getCurrencySymbol } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Receipt as ReceiptIcon } from 'lucide-react'

const EXTERNAL_CONTACT_VALUE = '__external__'

const ASSIGNMENT_LABELS: Record<LineItemAssignedType, string> = {
  personal: 'Personal',
  owe_me: 'Owe Me',
  i_owe: 'I Owe',
  shared: 'Shared',
}

const ASSIGNMENT_STYLES: Record<LineItemAssignedType, string> = {
  personal: 'bg-muted text-muted-foreground',
  owe_me: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  i_owe: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  shared: 'bg-primary/10 text-primary',
}

interface DraftParticipant {
  id: string
  participant_kind: 'self' | 'contact' | 'external'
  contact_id: string
  participant_name: string
  participant_email: string
  share_amount: string
  is_payer: boolean
}

function newDraftParticipant(partial: Partial<DraftParticipant> = {}): DraftParticipant {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random()}`,
    participant_kind: 'contact',
    contact_id: '',
    participant_name: '',
    participant_email: '',
    share_amount: '',
    is_payer: false,
    ...partial,
  }
}

interface LineItemsSectionProps {
  expense: Pick<Expense, 'id' | 'amount' | 'original_amount' | 'original_currency' | 'exchange_rate_used'>
  onChanged?: () => void
}

export function LineItemsSection({ expense, onChanged }: LineItemsSectionProps) {
  const [items, setItems] = useState<ExpenseLineItem[]>([])
  const [participantsByItem, setParticipantsByItem] = useState<Map<string, ExpenseParticipant[]>>(new Map())
  const [obligationsByItem, setObligationsByItem] = useState<Map<string, PersonalObligation>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ExpenseLineItem | null>(null)

  const currency = expense.original_currency ?? 'PHP'
  const symbol = getCurrencySymbol(currency)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getExpenseLineItems(expense.id)
      setItems(data.items)
      setParticipantsByItem(data.participantsByItem)
      setObligationsByItem(data.obligationsByItem)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load line items')
    } finally {
      setIsLoading(false)
    }
  }, [expense.id])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
      getContacts().then(setContacts).catch(() => setContacts([]))
    }, 0)

    return () => window.clearTimeout(timer)
  }, [load])

  const allocation = useMemo(() => computeAllocation(expense, items), [expense, items])

  const openAdd = () => { setEditingItem(null); setShowForm(true) }
  const openEdit = (item: ExpenseLineItem) => { setEditingItem(item); setShowForm(true) }

  const handleDelete = async (item: ExpenseLineItem) => {
    if (!window.confirm(`Delete "${item.description}"?`)) return
    try {
      await deleteExpenseLineItem(item.id)
      toast.success('Line item deleted')
      await load()
      onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete line item')
    }
  }

  const handleSubmit = async (formData: ExpenseLineItemFormData) => {
    try {
      if (editingItem) {
        await updateExpenseLineItem(editingItem, expense, items, formData)
        toast.success('Line item updated')
      } else {
        await createExpenseLineItem(expense, items, formData)
        toast.success('Line item added')
      }
      setShowForm(false)
      setEditingItem(null)
      await load()
      onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save line item')
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ReceiptIcon className="h-4 w-4" />
          Receipt Itemization
        </h2>
        <Button type="button" size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {items.length > 0 && (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Allocated</span>
            <span className="font-semibold tabular-nums">
              {symbol}{allocation.allocated.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              {' / '}
              {symbol}{allocation.nativeTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', allocation.isFullyAllocated ? 'bg-emerald-500' : 'bg-primary')}
              style={{ width: `${allocation.percentAllocated}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className={allocation.isFullyAllocated ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
              {allocation.isFullyAllocated ? 'Fully Allocated' : `${symbol}${allocation.unallocated.toLocaleString('en-US', { maximumFractionDigits: 2 })} remaining`}
            </span>
            <span className="text-muted-foreground">{allocation.percentAllocated.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No line items yet. Break this receipt down into individual purchases.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const obligation = obligationsByItem.get(item.id)
            const participants = participantsByItem.get(item.id) ?? []
            return (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.description}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', ASSIGNMENT_STYLES[item.assigned_type])}>
                        {ASSIGNMENT_LABELS[item.assigned_type]}
                      </span>
                      {item.category && <span className="text-xs text-muted-foreground">{item.category}</span>}
                    </div>
                    {obligation && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {obligation.direction === 'owed_to_user'
                          ? `${obligation.contact_name} owes you ${formatCurrency(obligation.remaining_amount)}`
                          : `You owe ${obligation.contact_name} ${formatCurrency(obligation.remaining_amount)}`}
                      </p>
                    )}
                    {participants.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Split {participants.length} ways
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums">
                        {symbol}{item.original_amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </p>
                      {item.original_currency !== 'PHP' && (
                        <p className="text-[10px] text-muted-foreground">
                          ({formatCurrency(item.converted_amount)})
                        </p>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(item)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setEditingItem(null) }}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Line Item' : 'Add Line Item'}</DialogTitle>
          </DialogHeader>
          <LineItemForm
            currencySymbol={symbol}
            remaining={editingItem ? allocation.unallocated + editingItem.original_amount : allocation.unallocated}
            contacts={contacts}
            initialData={editingItem ?? undefined}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingItem(null) }}
          />
        </DialogContent>
      </Dialog>
    </section>
  )
}

function LineItemForm({
  currencySymbol, remaining, contacts, initialData, onSubmit, onCancel,
}: {
  currencySymbol: string
  remaining: number
  contacts: Contact[]
  initialData?: ExpenseLineItem
  onSubmit: (data: ExpenseLineItemFormData) => Promise<void>
  onCancel: () => void
}) {
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [category, setCategory] = useState(initialData?.category ?? 'Food')
  const [amount, setAmount] = useState(initialData?.original_amount?.toString() ?? '')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [assignedType, setAssignedType] = useState<LineItemAssignedType>(initialData?.assigned_type ?? 'personal')
  const [contactId, setContactId] = useState('')
  const [externalName, setExternalName] = useState('')
  const [externalEmail, setExternalEmail] = useState('')
  const [participants, setParticipants] = useState<DraftParticipant[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const needsContact = assignedType === 'owe_me' || assignedType === 'i_owe'
  const isExternal = contactId === EXTERNAL_CONTACT_VALUE
  const selectedContact = isExternal ? null : contacts.find((c) => c.id === contactId) ?? null
  const contactName = isExternal ? externalName.trim() : selectedContact?.name ?? ''
  const contactEmail = isExternal ? externalEmail.trim() || null : selectedContact?.email ?? null
  const contactUserId = isExternal ? null : selectedContact?.linked_user_id ?? null

  const amt = parseFloat(amount) || 0
  const participantTotal = participants.reduce((s, p) => s + (parseFloat(p.share_amount) || 0), 0)
  const participantsValid = assignedType !== 'shared' || (
    participants.length >= 2
    && participants.some((p) => p.is_payer)
    && participants.every((p) => p.participant_name.trim() && parseFloat(p.share_amount) >= 0)
    && Math.abs(participantTotal - amt) < 0.01
  )

  const canSubmit = !!description.trim()
    && amt > 0
    && amt <= remaining + 0.01
    && (!needsContact || !!contactName)
    && participantsValid

  const addParticipantRow = () => {
    if (participants.length === 0) {
      setParticipants([
        newDraftParticipant({ participant_kind: 'self', participant_name: 'Me', is_payer: true }),
        newDraftParticipant(),
      ])
    } else {
      setParticipants((prev) => [...prev, newDraftParticipant()])
    }
  }

  const updateParticipant = (id: string, next: Partial<DraftParticipant>) => {
    setParticipants((prev) => prev.map((p) => {
      if (p.id === id) return { ...p, ...next }
      return next.is_payer === true ? { ...p, is_payer: false } : p
    }))
  }

  const selectParticipantContact = (id: string, value: string) => {
    if (value === 'self') {
      updateParticipant(id, { participant_kind: 'self', contact_id: '', participant_name: 'Me', participant_email: '' })
      return
    }
    if (value === 'external') {
      updateParticipant(id, { participant_kind: 'external', contact_id: '', participant_name: '', participant_email: '' })
      return
    }
    const contact = contacts.find((c) => c.id === value)
    if (!contact) return
    updateParticipant(id, { participant_kind: 'contact', contact_id: contact.id, participant_name: contact.name, participant_email: contact.email ?? '' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      const participantPayload: ExpenseParticipantFormData[] = participants.map((p) => ({
        participant_kind: p.participant_kind,
        contact_id: p.contact_id || null,
        participant_name: p.participant_name.trim(),
        participant_email: p.participant_email.trim() || null,
        share_amount: parseFloat(p.share_amount) || 0,
        is_payer: p.is_payer,
      }))
      await onSubmit({
        description: description.trim(),
        category,
        original_amount: amt,
        assigned_type: assignedType,
        notes: notes.trim(),
        contact_id: needsContact ? (isExternal ? null : selectedContact?.id ?? null) : undefined,
        contact_user_id: needsContact ? contactUserId : undefined,
        contact_name: needsContact ? contactName : undefined,
        contact_email: needsContact ? contactEmail : undefined,
        split_mode: 'custom',
        participants: assignedType === 'shared' ? participantPayload : undefined,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Description</Label>
        <Input
          placeholder="e.g. Japanese Snacks"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-11 rounded-xl"
          required
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Category</Label>
        <CategorySelector value={category} onChange={setCategory} />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Amount ({currencySymbol})</Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
          <Input
            type="number" inputMode="decimal" step="0.01" min="0.01"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="pl-9 h-12 text-lg font-semibold rounded-xl" required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {currencySymbol}{remaining.toLocaleString('en-US', { maximumFractionDigits: 2 })} unallocated remaining
        </p>
        {amt > remaining + 0.01 && (
          <p className="text-xs text-destructive">This exceeds the remaining unallocated amount.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Assignment</Label>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(ASSIGNMENT_LABELS) as LineItemAssignedType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAssignedType(type)}
              className={cn(
                'h-10 rounded-xl border text-xs font-semibold transition-colors',
                assignedType === type ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
              )}
            >
              {ASSIGNMENT_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {needsContact && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">{assignedType === 'i_owe' ? 'Paid By' : 'Contact'}</Label>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">Select a contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>
            ))}
            <option value={EXTERNAL_CONTACT_VALUE}>External person</option>
          </select>
          {isExternal && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Name" value={externalName} onChange={(e) => setExternalName(e.target.value)} className="h-10 rounded-xl" />
              <Input placeholder="Email" value={externalEmail} onChange={(e) => setExternalEmail(e.target.value)} className="h-10 rounded-xl" />
            </div>
          )}
        </div>
      )}

      {assignedType === 'shared' && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Split among</Label>
            <Button type="button" variant="outline" size="sm" onClick={addParticipantRow}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          {participants.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_92px_34px] gap-2 items-center">
              <select
                value={p.participant_kind === 'self' ? 'self' : p.participant_kind === 'external' ? 'external' : p.contact_id}
                onChange={(e) => selectParticipantContact(p.id, e.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Select participant</option>
                <option value="self">Me</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="external">External person</option>
              </select>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={p.share_amount}
                onChange={(e) => updateParticipant(p.id, { share_amount: e.target.value })}
                className="h-10 rounded-xl text-right"
              />
              <button
                type="button"
                onClick={() => updateParticipant(p.id, { is_payer: true })}
                className={cn('h-10 rounded-xl border text-xs font-bold', p.is_payer ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}
                title="Set as payer"
              >
                P
              </button>
            </div>
          ))}
          {participants.length > 0 && Math.abs(participantTotal - amt) >= 0.01 && (
            <p className="text-xs text-destructive">Shares must total {currencySymbol}{amt.toFixed(2)}.</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl" />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSubmitting || !canSubmit}>
          {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Add Item'}
        </Button>
      </div>
    </form>
  )
}
