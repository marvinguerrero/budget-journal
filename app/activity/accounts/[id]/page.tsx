import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountDetailClient } from './AccountDetailClient'

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <AccountDetailClient accountId={id} />
}
