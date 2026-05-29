import { createClient } from '@/lib/supabase/client'
import { Contact, ContactFormData, ContactRequest } from '@/types'

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

async function resolveLinkedUser(email: string | null): Promise<{ type: 'external' | 'registered'; linkedUserId: string | null }> {
  if (!email) return { type: 'external', linkedUserId: null }

  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  return data?.id
    ? { type: 'registered', linkedUserId: data.id }
    : { type: 'external', linkedUserId: null }
}

export async function getContacts(): Promise<Contact[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getContact(id: string): Promise<Contact> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createContact(formData: ContactFormData): Promise<Contact> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const email = normalizeEmail(formData.email)
  const linked = await resolveLinkedUser(email)

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: user.id,
      name: formData.name.trim(),
      email,
      phone: formData.phone?.trim() || null,
      notes: formData.notes?.trim() || null,
      contact_type: 'external',
      link_status: linked.linkedUserId ? 'pending' : 'none',
      linked_user_id: linked.linkedUserId,
    })
    .select()
    .single()

  if (error) throw error
  if (linked.linkedUserId) {
    await requestContactConnection(data.id).catch(() => null)
  }
  return data
}

export async function updateContact(id: string, formData: ContactFormData): Promise<Contact> {
  const supabase = createClient()
  const email = normalizeEmail(formData.email)
  const linked = await resolveLinkedUser(email)

  const { data, error } = await supabase
    .from('contacts')
    .update({
      name: formData.name.trim(),
      email,
      phone: formData.phone?.trim() || null,
      notes: formData.notes?.trim() || null,
      contact_type: 'external',
      link_status: linked.linkedUserId ? 'pending' : 'none',
      linked_user_id: linked.linkedUserId,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  if (linked.linkedUserId) {
    await requestContactConnection(data.id).catch(() => null)
  }
  return data
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function requestContactConnection(contactId: string): Promise<ContactRequest> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('request_contact_connection', {
    p_contact_id: contactId,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function acceptContactRequest(requestId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('accept_contact_request', {
    p_request_id: requestId,
  })
  if (error) throw new Error(error.message)
}

export async function declineContactRequest(requestId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('decline_contact_request', {
    p_request_id: requestId,
  })
  if (error) throw new Error(error.message)
}
