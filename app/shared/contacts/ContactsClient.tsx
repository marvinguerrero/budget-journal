'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Contact, ContactFormData } from '@/types'
import { createContact, deleteContact, getContacts, updateContact } from '@/services/contacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ChevronRight, Mail, Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'

function ContactForm({
  contact,
  onCancel,
  onSave,
  isSaving,
}: {
  contact?: Contact | null
  onCancel: () => void
  onSave: (data: ContactFormData) => Promise<void>
  isSaving: boolean
}) {
  const [name, setName] = useState(contact?.name ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')

  const canSave = name.trim().length > 0

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!canSave) return
        await onSave({ name, email, phone, notes })
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" required />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl" />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl" />
      </div>
      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={!canSave || isSaving}>
          {isSaving ? 'Saving...' : contact ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  )
}

export function ContactsClient() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const load = async () => {
    try {
      setContacts(await getContacts())
    } catch {
      toast.error('Failed to load contacts')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const groupedContacts = useMemo(() => ({
    registered: contacts.filter((contact) => contact.contact_type === 'registered'),
    external: contacts.filter((contact) => contact.contact_type === 'external'),
  }), [contacts])

  const handleCreate = async (data: ContactFormData) => {
    setIsSaving(true)
    try {
      const contact = await createContact(data)
      setContacts((prev) => [...prev, contact].sort((a, b) => a.name.localeCompare(b.name)))
      setShowAdd(false)
      toast.success('Contact added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add contact')
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdate = async (data: ContactFormData) => {
    if (!editing) return
    setIsSaving(true)
    try {
      const contact = await updateContact(editing.id, data)
      setContacts((prev) => prev.map((item) => item.id === contact.id ? contact : item).sort((a, b) => a.name.localeCompare(b.name)))
      setEditing(null)
      toast.success('Contact updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update contact')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (contact: Contact) => {
    if (!window.confirm(`Delete ${contact.name}? Existing debts will keep the contact name.`)) return
    try {
      await deleteContact(contact.id)
      setContacts((prev) => prev.filter((item) => item.id !== contact.id))
      toast.success('Contact deleted')
    } catch {
      toast.error('Failed to delete contact')
    }
  }

  const renderContact = (contact: Contact) => (
    <div key={contact.id} className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card">
      <Link href={`/shared/contacts/${contact.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <div className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
          contact.contact_type === 'registered' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
        )}>
          <UserRound className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate">{contact.name}</p>
            <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground capitalize">
              {contact.link_status && contact.link_status !== 'none' ? contact.link_status : contact.contact_type}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {contact.email && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{contact.email}</span>}
            {contact.phone && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{contact.phone}</span>}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </Link>
      <button type="button" onClick={() => setEditing(contact)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground">
        <Pencil className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => handleDelete(contact)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">People used for personal debts and shared workflows</p>
        </div>
        <Button type="button" size="sm" className="h-9 rounded-xl gap-1.5 text-xs" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/shared" className="h-10 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent text-sm font-semibold flex items-center justify-center">
          Shared Budgets
        </Link>
        <Link href="/shared/contacts" className="h-10 rounded-xl border border-primary bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
          Contacts
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <UserRound className="w-8 h-8 text-primary" />
            </div>
          </div>
          <p className="font-semibold">No contacts yet</p>
          <p className="text-sm text-muted-foreground">Add a person to use in Owe Me and I Owe records.</p>
          <Button className="rounded-xl" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedContacts.registered.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Registered Users</h2>
              {groupedContacts.registered.map(renderContact)}
            </section>
          )}
          {groupedContacts.external.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">External Contacts</h2>
              {groupedContacts.external.map(renderContact)}
            </section>
          )}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Add Contact</DialogTitle>
          </DialogHeader>
          <ContactForm onCancel={() => setShowAdd(false)} onSave={handleCreate} isSaving={isSaving} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Contact</DialogTitle>
          </DialogHeader>
          <ContactForm contact={editing} onCancel={() => setEditing(null)} onSave={handleUpdate} isSaving={isSaving} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
