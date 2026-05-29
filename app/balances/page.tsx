import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BalancesClient } from './BalancesClient'

export default async function BalancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <BalancesClient userId={user.id} />
}
