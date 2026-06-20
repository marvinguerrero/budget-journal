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
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { getCurrencySymbol, isForeignCurrency } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { createActionTrace, perfNow } from '@/lib/performance'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'

const EXTERNAL_CONTACT_VALUE = '__external__'

interface ExpenseFormProps {
  onSubmit: (data: ExpenseFormData) => Promise<void>
  onCancel: () => void
  initialData?: Partial<ExpenseFormData>
  isEditing?: boolean
}

type DraftParticipant = {
  id: string
  participant_kind: 'self' | 'contact' | 'external'
  contact_id: string
  participant_name: string
  participant_email: string
  participant_phone: string
  share_amount: string
  is_payer: boolean
}

function createDraftId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `participant-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createDraftParticipant(partial: Partial<DraftParticipant> = {}): DraftParticipant {
  return {
    id: createDraftId(),
    participant_kind: 'contact',
    contact_id: '',
    participant_name: '',
    participant_email: '',
    participant_phone: '',
    share_amount: '',
    is_payer: false,
    ...partial,
  }
}

function splitAmountEqually(total: number, count: number) {
  if (count <= 0 || total <= 0) return []
  const totalCents = Math.round(total * 100)
  const base = Math.floor(totalCents / count)
  let remainder = totalCents - base * count
  return Array.from({ length: count }, () => {
    const cents = base + (remainder > 0 ? 1 : 0)
    remainder -= 1
    return (cents / 100).toFixed(2)
  })
}

export function ExpenseForm({ onSubmit, onCancel, initialData, isEditing }: ExpenseFormProps) {
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '')
  const [category, setCategory] = useState(initialData?.category || 'Food')
  const [note, setNote] = useState(initialData?.note || '')
  const [accountId, setAccountId] = useState(initialData?.account_id ?? '')
  const [obligationType, setObligationType] = useState<'normal' | 'owe_me' | 'i_owe'>(initialData?.obligation_type ?? 'normal')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState(initialData?.contact_id ?? '')
  const [externalContactName, setExternalContactName] = useState(initialData?.contact_id ? '' : initialData?.contact_name ?? '')
  const [externalContactEmail, setExternalContactEmail] = useState(initialData?.contact_id ? '' : initialData?.contact_email ?? '')
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>(initialData?.split_mode ?? 'equal')
  const [participants, setParticipants] = useState<DraftParticipant[]>(
    initialData?.participants?.map((participant) => createDraftParticipant({
      participant_kind: participant.participant_kind,
      contact_id: participant.contact_id ?? '',
      participant_name: participant.participant_name,
      participant_email: participant.participant_email ?? '',
      participant_phone: participant.participant_phone ?? '',
      share_amount: String(participant.share_amount),
      is_payer: participant.is_payer === true,
    })) ?? []
  )
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
          else setContactId(EXTERNAL_CONTACT_VALUE)
        }
      })
      .catch(() => { if (!cancelled) setContacts([]) })
    return () => { cancelled = true }
  }, [contactId, initialData?.contact_email, initialData?.contact_name])

  const { accounts } = useFinancialAccounts()
  const selectedAccount = accounts.find((a) => a.id === accountId)
  const isForeignAccount = !!selectedAccount && isForeignCurrency(selectedAccount.currency_code, selectedAccount.base_currency_code)
  const hasExchangeRate = isForeignAccount && !!selectedAccount?.average_exchange_rate && selectedAccount.average_exchange_rate > 0
  const currencySymbol = isForeignAccount && selectedAccount ? getCurrencySymbol(selectedAccount.currency_code) : '₱'
  const convertedPreview = isForeignAccount && hasExchangeRate && amount
    ? (parseFloat(amount) || 0) * (selectedAccount?.average_exchange_rate ?? 0)
    : null
  // Participant splitting always works in PHP; foreign-currency amounts are
  // entered natively, so combining the two would mix units. Scoped out for now.
  const blocksParticipants = obligationType === 'normal' && isForeignAccount

  // If the user had added participants and then switches to a foreign-currency
  // account, clear them automatically — otherwise the (now-hidden) section would
  // leave canSubmit permanently blocked with no visible way to fix it.
  useEffect(() => {
    if (blocksParticipants && participants.length > 0) {
      setParticipants([])
    }
  }, [blocksParticipants, participants.length])

  const isObligation = obligationType !== 'normal'
  const isExternalContact = contactId === EXTERNAL_CONTACT_VALUE
  const selectedContact = isExternalContact ? null : contacts.find((contact) => contact.id === contactId) ?? null
  const obligationContactName = isExternalContact ? externalContactName.trim() : selectedContact?.name ?? ''
  const obligationContactEmail = isExternalContact ? externalContactEmail.trim() || null : selectedContact?.email ?? null
  const obligationContactUserId = isExternalContact ? null : selectedContact?.linked_user_id ?? null
  const obligationContactId = isExternalContact ? null : selectedContact?.id ?? null
  const obligationContactIsValid = !isObligation || Boolean(obligationContactName)
  const supportsParticipants = (obligationType === 'normal' || obligationType === 'i_owe') && !blocksParticipants
  const hasParticipants = participants.length > 0
  const equalShares = splitMode === 'equal'
    ? splitAmountEqually(parseFloat(amount) || 0, participants.length)
    : []
  const participantTotal = participants.reduce((sum, participant, index) => (
    sum + (parseFloat(splitMode === 'equal' ? equalShares[index] : participant.share_amount) || 0)
  ), 0)
  const hasNegativeParticipantShare = participants.some((participant, index) =>
    parseFloat(splitMode === 'equal' ? equalShares[index] : participant.share_amount) < 0
  )
  const participantsAreValid = !hasParticipants || (
    participants.some((participant) => participant.is_payer)
    && participants.every((participant, index) => (
      participant.participant_name.trim()
      && Number.isFinite(parseFloat(splitMode === 'equal' ? equalShares[index] : participant.share_amount))
      && parseFloat(splitMode === 'equal' ? equalShares[index] : participant.share_amount) >= 0
    ))
    && Math.abs(participantTotal - (parseFloat(amount) || 0)) < 0.01
  )
  const hasValidAmount = !!amount && parseFloat(amount) > 0
  const canSubmit = hasValidAmount
    && obligationContactIsValid
    && (obligationType !== 'owe_me' || !!accountId)
    && (!isForeignAccount || hasExchangeRate)
    && (!blocksParticipants || !hasParticipants)
    && participantsAreValid

  const addParticipants = () => {
    if (participants.length > 0) {
      setParticipants((current) => [...current, createDraftParticipant()])
      return
    }

    if (obligationType === 'i_owe' && obligationContactName) {
      setParticipants([
        createDraftParticipant({
          participant_kind: isExternalContact ? 'external' : 'contact',
          contact_id: obligationContactId ?? '',
          participant_name: obligationContactName,
          participant_email: obligationContactEmail ?? '',
          is_payer: true,
        }),
        createDraftParticipant({
          participant_kind: 'self',
          participant_name: 'Me',
        }),
      ])
      return
    }

    setParticipants([
      createDraftParticipant({
        participant_kind: 'self',
        participant_name: 'Me',
        is_payer: true,
      }),
      createDraftParticipant(),
    ])
  }

  const updateParticipant = (id: string, next: Partial<DraftParticipant>) => {
    setParticipants((current) => current.map((participant) => {
      if (participant.id !== id) return participant
      const updated = { ...participant, ...next }
      if (next.is_payer === true) {
        return updated
      }
      return updated
    }).map((participant) => (
      next.is_payer === true && participant.id !== id
        ? { ...participant, is_payer: false }
        : participant
    )))
  }

  const selectParticipantContact = (id: string, value: string) => {
    if (value === 'self') {
      updateParticipant(id, {
        participant_kind: 'self',
        contact_id: '',
        participant_name: 'Me',
        participant_email: '',
        participant_phone: '',
      })
      return
    }

    if (value === 'external') {
      updateParticipant(id, {
        participant_kind: 'external',
        contact_id: '',
        participant_name: '',
        participant_email: '',
        participant_phone: '',
      })
      return
    }

    const contact = contacts.find((item) => item.id === value)
    if (!contact) return
    updateParticipant(id, {
      participant_kind: 'contact',
      contact_id: contact.id,
      participant_name: contact.name,
      participant_email: contact.email ?? '',
      participant_phone: '',
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trace = createActionTrace(isEditing ? 'ui.expense_form.submit_edit' : 'ui.expense_form.submit_add', {
      hasReceipt: Boolean(receiptFile),
      obligationType,
    })
    const validationStart = perfNow()
    if (!canSubmit) {
      trace.measure('validation', validationStart, { valid: false })
      trace.end()
      return
    }
    trace.measure('validation', validationStart, { valid: true })

    setIsSubmitting(true)
    try {
      await trace.step('submit_handler', () => onSubmit({
        amount: parseFloat(amount),
        category,
        note: note.trim() || category,
        account_id: obligationType === 'i_owe' ? null : accountId || null,
        created_at: new Date(date + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
        obligation_type: obligationType,
        contact_id: isObligation ? obligationContactId : undefined,
        contact_name: isObligation ? obligationContactName : undefined,
        contact_email: isObligation ? obligationContactEmail : undefined,
        contact_user_id: isObligation ? obligationContactUserId : undefined,
        receipt_file: obligationType === 'i_owe' ? null : receiptFile,
        remove_receipt: obligationType === 'i_owe' ? false : removeReceipt,
        split_mode: splitMode,
        participants: hasParticipants
          ? participants.map((participant, index) => {
            const contact = participant.contact_id
              ? contacts.find((item) => item.id === participant.contact_id)
              : null
            return {
              participant_kind: participant.participant_kind,
              contact_id: participant.contact_id || null,
              contact_user_id: contact?.linked_user_id ?? null,
              participant_name: participant.participant_name.trim(),
              participant_email: participant.participant_email.trim() || null,
              ...(participant.participant_kind === 'external' && participant.participant_phone.trim()
                ? { participant_phone: participant.participant_phone.trim() }
                : {}),
              share_amount: parseFloat(splitMode === 'equal' ? equalShares[index] : participant.share_amount),
              is_payer: participant.is_payer,
            }
          })
          : undefined,
      }))
    } catch {
      // Submit handlers show the specific toast; keep the form open without
      // bubbling validation failures into the Next.js runtime overlay.
    } finally {
      setIsSubmitting(false)
      trace.end()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="amount" className="text-sm font-semibold">
          Amount ({currencySymbol}{isForeignAccount ? ` ${selectedAccount?.currency_code}` : ''})
        </Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-lg">{currencySymbol}</span>
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
        {isForeignAccount && !hasExchangeRate && (
          <p className="text-xs text-destructive rounded-xl border border-destructive/30 bg-destructive/5 p-2.5">
            "{selectedAccount?.name}" has no exchange rate yet — fund it with a currency exchange transfer
            (Activity → Accounts → Transfer) before recording an expense against it.
          </p>
        )}
        {convertedPreview !== null && (
          <p className="text-xs text-muted-foreground">
            ≈ {formatCurrency(convertedPreview)} at the account's average rate
          </p>
        )}
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
            {obligationType === 'i_owe' ? 'Paid By' : 'Contact'}
          </Label>
          <select
            id="contactId"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">{obligationType === 'i_owe' ? 'Select who paid' : 'Select a contact'}</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}{contact.email ? ` · ${contact.email}` : ''}{contact.contact_type === 'registered' ? ' · registered' : ''}
              </option>
            ))}
            <option value={EXTERNAL_CONTACT_VALUE}>External person</option>
          </select>
          {isExternalContact ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Name"
                value={externalContactName}
                onChange={(event) => setExternalContactName(event.target.value)}
                className="h-10 rounded-xl"
              />
              <Input
                placeholder="Email"
                value={externalContactEmail}
                onChange={(event) => setExternalContactEmail(event.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          ) : selectedContact ? (
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

      {supportsParticipants && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-semibold">Participants</Label>
              <p className="text-xs text-muted-foreground">Optional split tracking for this expense.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addParticipants}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {hasParticipants && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'equal', label: 'Equal Split' },
                  { value: 'custom', label: 'Custom Split' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSplitMode(option.value)}
                    className={cn(
                      'h-9 rounded-xl border text-xs font-semibold transition-colors',
                      splitMode === option.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {participants.map((participant, index) => (
                  <div key={participant.id} className="grid grid-cols-[1fr_92px_34px_34px] gap-2 items-start">
                    <div className="space-y-2">
                      <select
                        value={
                          participant.participant_kind === 'self'
                            ? 'self'
                            : participant.participant_kind === 'external'
                              ? 'external'
                              : participant.contact_id
                        }
                        onChange={(event) => selectParticipantContact(participant.id, event.target.value)}
                        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Select participant</option>
                        <option value="self">Me</option>
                        {contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name}{contact.contact_type === 'registered' ? ' · registered' : ''}
                          </option>
                        ))}
                        <option value="external">External person</option>
                      </select>
                      {participant.participant_kind === 'external' && (
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Input
                            placeholder="Name"
                            value={participant.participant_name}
                            onChange={(event) => updateParticipant(participant.id, { participant_name: event.target.value })}
                            className="h-10 rounded-xl"
                          />
                          <Input
                            placeholder="Email"
                            value={participant.participant_email}
                            onChange={(event) => updateParticipant(participant.id, { participant_email: event.target.value })}
                            className="h-10 rounded-xl"
                          />
                          <Input
                            placeholder="Phone"
                            value={participant.participant_phone}
                            onChange={(event) => updateParticipant(participant.id, { participant_phone: event.target.value })}
                            className="h-10 rounded-xl"
                          />
                        </div>
                      )}
                    </div>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={splitMode === 'equal' ? equalShares[index] ?? '' : participant.share_amount}
                      onChange={(event) => updateParticipant(participant.id, { share_amount: event.target.value })}
                      disabled={splitMode === 'equal'}
                      className="h-10 rounded-xl text-right"
                    />
                    <button
                      type="button"
                      onClick={() => updateParticipant(participant.id, { is_payer: true })}
                      className={cn(
                        'h-10 rounded-xl border text-xs font-bold',
                        participant.is_payer
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground'
                      )}
                      aria-label="Set as payer"
                      title="Set as payer"
                    >
                      P
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setParticipants((current) => current.filter((item) => item.id !== participant.id))}
                      className="h-10 w-10 rounded-xl p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {splitMode === 'custom' && Math.abs(participantTotal - (parseFloat(amount) || 0)) >= 0.01 && (
                <p className="text-xs text-destructive">
                  Custom shares must total ₱{amount || '0.00'}.
                </p>
              )}
              {splitMode === 'custom' && hasNegativeParticipantShare && (
                <p className="text-xs text-destructive">
                  Shares cannot be negative.
                </p>
              )}
            </div>
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

      {blocksParticipants && (
        <p className="text-xs text-muted-foreground">
          Splitting with participants isn't available for foreign-currency account expenses yet.
        </p>
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
