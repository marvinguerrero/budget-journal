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
  deleteExpenseLineItem, computeAllocation, deriveLineItemStatus,
} from '@/services/expenseLineItems'
import { getContacts } from '@/services/contacts'
import {
  Contact, Expense, ExpenseLineItem, ExpenseLineItemFormData,
  ExpenseParticipant, PersonalObligation, LineItemDerivedStatus,
  ExpenseParticipantFormData, PersonRef,
} from '@/types'
import { getCurrencySymbol } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import { cn } from '@/lib/utils'
import { createActionTrace } from '@/lib/performance'
import { Plus, Pencil, Trash2, Receipt as ReceiptIcon } from 'lucide-react'

const EXTERNAL_VALUE = '__external__'
const SELF: PersonRef = { kind: 'self' }

const STATUS_LABELS: Record<LineItemDerivedStatus, string> = {
  personal: 'Personal',
  receivable: 'Receivable',
  payable: 'Payable',
  gift: 'Gift',
  shared: 'Shared',
}

const STATUS_STYLES: Record<LineItemDerivedStatus, string> = {
  personal: 'bg-muted text-muted-foreground',
  receivable: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  payable: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  gift: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
  shared: 'bg-primary/10 text-primary',
}

function personLabel(ref: PersonRef | null | undefined, currentUserLabel = 'Me'): string {
  if (!ref || ref.kind === 'self') return currentUserLabel
  return ref.name?.trim() || 'Unnamed'
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
    const trace = createActionTrace('expense_itemization.refetch')
    setIsLoading(true)
    try {
      const data = await trace.step('refetch.line_items', () => getExpenseLineItems(expense.id))
      setItems(data.items)
      setParticipantsByItem(data.participantsByItem)
      setObligationsByItem(data.obligationsByItem)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load line items')
    } finally {
      setIsLoading(false)
      trace.end()
    }
  }, [expense.id])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    if (!showForm || contacts.length > 0) return
    const trace = createActionTrace('expense_itemization.contacts.lazy_load')
    trace.step('refetch.contacts_for_line_item_form', () => getContacts())
      .then((nextContacts) => {
        setContacts(nextContacts)
      })
      .catch(() => setContacts([]))
      .finally(() => trace.end())
  }, [contacts.length, showForm])

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
            const isSharedSplit = participants.length > 0
            return (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.description}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', STATUS_STYLES[item.derived_status])}>
                        {STATUS_LABELS[item.derived_status]}
                      </span>
                      {item.category && <span className="text-xs text-muted-foreground">{item.category}</span>}
                    </div>
                    {!isSharedSplit && item.derived_status !== 'personal' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Owner: {personLabel({ kind: item.owner_kind, name: item.owner_name } as PersonRef)}
                        {item.owner_kind !== item.payer_kind || item.owner_contact_id !== item.payer_contact_id || item.owner_name !== item.payer_name ? (
                          <> · Payer: {personLabel({ kind: item.payer_kind, name: item.payer_name } as PersonRef)}</>
                        ) : null}
                        {' · '}Shouldered by: {personLabel({ kind: item.shouldered_by_kind, name: item.shouldered_by_name } as PersonRef)}
                      </p>
                    )}
                    {obligation && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {obligation.direction === 'owed_to_user'
                          ? `${obligation.contact_name} owes you ${formatCurrency(obligation.remaining_amount)}`
                          : `You owe ${obligation.contact_name} ${formatCurrency(obligation.remaining_amount)}`}
                      </p>
                    )}
                    {isSharedSplit && (
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
            existingParticipants={editingItem ? participantsByItem.get(editingItem.id) ?? [] : []}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingItem(null) }}
          />
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ── Person picker — reused for Owner / Payer / Shouldered By ──────────────────
function PersonPicker({
  label, value, onChange, contacts,
}: {
  label: string
  value: PersonRef
  onChange: (ref: PersonRef) => void
  contacts: Contact[]
}) {
  const selectValue = value.kind === 'self' ? 'self' : value.kind === 'external' ? EXTERNAL_VALUE : (value.contact_id ?? '')

  const handleSelect = (v: string) => {
    if (v === 'self') { onChange(SELF); return }
    if (v === EXTERNAL_VALUE) { onChange({ kind: 'external', name: '', email: '' }); return }
    const contact = contacts.find((c) => c.id === v)
    if (!contact) return
    onChange({ kind: 'contact', contact_id: contact.id, name: contact.name, email: contact.email ?? '' })
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <select
        aria-label={label}
        value={selectValue}
        onChange={(e) => handleSelect(e.target.value)}
        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
      >
        <option value="self">Me</option>
        {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        <option value={EXTERNAL_VALUE}>External person</option>
      </select>
      {value.kind === 'external' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Name"
            value={value.name ?? ''}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="h-9 rounded-xl text-sm"
          />
          <Input
            placeholder="Email (optional)"
            value={value.email ?? ''}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            className="h-9 rounded-xl text-sm"
          />
        </div>
      )}
    </div>
  )
}

function LineItemForm({
  currencySymbol, remaining, contacts, initialData, existingParticipants, onSubmit, onCancel,
}: {
  currencySymbol: string
  remaining: number
  contacts: Contact[]
  initialData?: ExpenseLineItem
  existingParticipants: ExpenseParticipant[]
  onSubmit: (data: ExpenseLineItemFormData) => Promise<void>
  onCancel: () => void
}) {
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [category, setCategory] = useState(initialData?.category ?? 'Food')
  const [amount, setAmount] = useState(initialData?.original_amount?.toString() ?? '')
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [isSharedSplit, setIsSharedSplit] = useState(existingParticipants.length > 0)

  const [owner, setOwner] = useState<PersonRef>(
    initialData ? { kind: initialData.owner_kind, contact_id: initialData.owner_contact_id, name: initialData.owner_name, email: initialData.owner_email } : SELF
  )
  const [payer, setPayer] = useState<PersonRef>(
    initialData ? { kind: initialData.payer_kind, contact_id: initialData.payer_contact_id, name: initialData.payer_name, email: initialData.payer_email } : SELF
  )
  const [shoulderedBy, setShoulderedBy] = useState<PersonRef>(
    initialData ? { kind: initialData.shouldered_by_kind, contact_id: initialData.shouldered_by_contact_id, name: initialData.shouldered_by_name, email: initialData.shouldered_by_email } : SELF
  )

  const [participants, setParticipants] = useState<DraftParticipant[]>(
    existingParticipants.map((p) => newDraftParticipant({
      participant_kind: p.participant_kind,
      contact_id: p.contact_id ?? '',
      participant_name: p.participant_name,
      participant_email: p.participant_email ?? '',
      share_amount: String(p.share_amount),
      is_payer: p.is_payer,
    }))
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const amt = parseFloat(amount) || 0
  const participantTotal = participants.reduce((s, p) => s + (parseFloat(p.share_amount) || 0), 0)
  const participantsValid = !isSharedSplit || (
    participants.length >= 2
    && participants.some((p) => p.is_payer)
    && participants.every((p) => p.participant_name.trim() && parseFloat(p.share_amount) >= 0)
    && Math.abs(participantTotal - amt) < 0.01
  )

  const ownershipValid = isSharedSplit || (
    (owner.kind !== 'external' || owner.name?.trim())
    && (payer.kind !== 'external' || payer.name?.trim())
    && (shoulderedBy.kind !== 'external' || shoulderedBy.name?.trim())
  )

  const previewStatus = isSharedSplit ? null : deriveLineItemStatus(owner, payer, shoulderedBy)

  const canSubmit = !!description.trim()
    && amt > 0
    && amt <= remaining + 0.01
    && ownershipValid
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
        notes: notes.trim(),
        is_shared_split: isSharedSplit,
        owner, payer, shouldered_by: shoulderedBy,
        split_mode: 'custom',
        participants: isSharedSplit ? participantPayload : undefined,
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
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Split among multiple people?</Label>
          <button
            type="button"
            onClick={() => setIsSharedSplit((v) => !v)}
            className={cn(
              'h-8 px-3 rounded-full text-xs font-semibold border transition-colors',
              isSharedSplit ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
            )}
          >
            {isSharedSplit ? 'Yes' : 'No'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {isSharedSplit
            ? 'Split this item\'s cost among several people (equal or custom shares).'
            : 'Describe who owns, who pays, and who fronted the money — the system figures out the rest.'}
        </p>
      </div>

      {!isSharedSplit && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <PersonPicker label="Owner — who ultimately owns/uses this item" value={owner} onChange={setOwner} contacts={contacts} />
          <PersonPicker label="Payer — who is responsible for paying" value={payer} onChange={setPayer} contacts={contacts} />
          <PersonPicker label="Shouldered By — who initially fronted the money" value={shoulderedBy} onChange={setShoulderedBy} contacts={contacts} />
          {previewStatus && (
            <div className={cn('rounded-lg px-3 py-2 text-xs font-semibold', STATUS_STYLES[previewStatus])}>
              Result: {STATUS_LABELS[previewStatus]}
              {previewStatus === 'payable' && ` — you owe ${personLabel(shoulderedBy)}`}
              {previewStatus === 'receivable' && ` — ${personLabel(owner)} owes you`}
              {previewStatus === 'gift' && ` — a gift to ${personLabel(owner)}, no debt tracked`}
              {previewStatus === 'shared' && ' — three different parties; not auto-tracked as your obligation'}
            </div>
          )}
        </div>
      )}

      {isSharedSplit && (
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
