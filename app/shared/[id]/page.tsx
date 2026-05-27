import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SharedGroupClient } from './SharedGroupClient'

export default async function SharedGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <SharedGroupClient groupId={id} currentUserId={user.id} currentUserEmail={user.email ?? ''} />
}
