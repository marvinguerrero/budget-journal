import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { ActivityTabs } from '@/components/layout/ActivityTabs'

export default async function IncomeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return (
    <AppShell userEmail={user?.email}>
      <ActivityTabs />
      {children}
    </AppShell>
  )
}
