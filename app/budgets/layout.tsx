import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { InsightsTabs } from '@/components/layout/InsightsTabs'

export default async function BudgetsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return (
    <AppShell userEmail={user?.email}>
      <InsightsTabs />
      {children}
    </AppShell>
  )
}
