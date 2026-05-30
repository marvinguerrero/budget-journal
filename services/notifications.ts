import { createClient } from '@/lib/supabase/client'
import { AppNotification } from '@/types'

export async function getNotifications(): Promise<AppNotification[]> {
  const supabase = createClient()
  await supabase.rpc('generate_credit_card_due_notifications')
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data || []
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('mark_notification_read', { p_id: id })
  if (error) throw new Error(error.message)
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('mark_all_notifications_read')
  if (error) throw new Error(error.message)
}
