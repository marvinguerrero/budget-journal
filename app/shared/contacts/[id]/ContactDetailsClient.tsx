'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Contact, PersonalObligation } from '@/types'
import { getContact, updateContact } from '@/services/contacts'
import { getPersonalObligations } from '@/services/personalObligations'
import { formatCurrency } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Mail, Pencil, Phone, UserRound } from 'lucide-react'
import { toast } from 'sonner'

export function ContactDetailsClient() {
  const params = useParams<{ id: string }>()
  const [contact, setContact] = useState<Contact | null>(null)
  const [obligations, setObligations] = useState<PersonalObligation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [contactData, personal] = await Promise.all([
          getContact(params.id),
          getPersonalObligations(),
        ])
        setContact(contactData)
        setName(contactData.name)
        setEmail(contactData.email ?? '')
        setPhone(contactData.phone ?? '')
        setNotes(contactData.notes ?? '')
        setObligations(personal.obligations)
      } catch {
        toast.error('Failed to load contact')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [params.id])

  const relatedObligations = useMemo(() => {
    if (!contact) return []
    return obligations.filter((obligation) =>
      obligation.status === 'open' &&
      obligation.remaining_amount > 0.005 &&
      (
        obligation.contact_id === contact.id ||
        (!!contact.linked_user_id && obligation.contact_user_id === contact.linked_user_id) ||
        (!!contact.email && obligation.contact_email?.toLowerCase() === contact.email.toLowerCase()) ||
        obligation.contact_name.toLowerCase() === contact.name.toLowerCase()
      )
    )
  }, [contact, obligations])

  const totals = useMemo(() => {
    const owesMe = relatedObligations
      .filter((obligation) => obligation.direction === 'owed_to_user')
      .reduce((sum, obligation) => sum + obligation.remaining_amount, 0)
    const iOwe = relatedObligations
      .filter((obligation) => obligation.direction === 'user_owes')
      .reduce((sum, obligation) => sum + obligation.remaining_amount, 0)
    return { owesMe, iOwe, net: owesMe - iOwe }
  }, [relatedObligations])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contact || !name.trim()) return
    setIsSaving(true)
    try {
      const updated = await updateContact(contact.id, { name, email, phone, notes })
      setContact(updated)
      setIsEditing(false)
      toast.success('Contact updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update contact')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-40 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="p-4 lg:p-6">
        <p className="font-semibold">Contact not found</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/shared/contacts" className="p-2 rounded-xl hover:bg-accent">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{contact.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {contact.link_status && contact.link_status !== 'none' ? contact.link_status : contact.contact_type} contact
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 text-xs" onClick={() => setIsEditing(true)}>
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserRound className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">
            {contact.email && <p className="text-sm text-muted-foreground inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{contact.email}</p>}
            {contact.phone && <p className="text-sm text-muted-foreground inline-flex items-center gap-1 ml-0 sm:ml-3"><Phone className="w-3.5 h-3.5" />{contact.phone}</p>}
            {contact.notes && <p className="text-sm mt-2">{contact.notes}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs text-muted-foreground">Owes Me</p>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(totals.owesMe)}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-xs text-muted-foreground">I Owe</p>
          <p className="text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums">{formatCurrency(totals.iOwe)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Net</p>
          <p className="text-lg font-bold tabular-nums">{formatCurrency(totals.net)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Active Personal Balances</h2>
        {relatedObligations.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No active personal balances for this contact.
          </div>
        ) : relatedObligations.map((obligation) => (
          <div key={obligation.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {obligation.direction === 'owed_to_user' ? 'Owes me' : 'I owe'}
              </p>
              <p className="text-xs text-muted-foreground truncate">{obligation.category}{obligation.note ? ` · ${obligation.note}` : ''}</p>
            </div>
            <span className="text-sm font-bold tabular-nums">{formatCurrency(obligation.remaining_amount)}</span>
          </div>
        ))}
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Contact</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" required />
            </div>
            <div className="space-y-2">
              <Label>Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl" disabled={isSaving || !name.trim()}>{isSaving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
