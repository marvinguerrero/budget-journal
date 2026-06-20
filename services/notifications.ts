import { createClient } from '@/lib/supabase/client'
import { AppNotification } from '@/types'
import { QUERY_LIMITS } from '@/lib/queryLimits'

const NOTIFICATION_SELECT = `
  id,
  user_id,
  type,
  title,
  message,
  is_read,
  related_id,
  created_at
`

export async function getNotifications(): Promise<AppNotification[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .order('created_at', { ascending: false })
    .limit(QUERY_LIMITS.notifications)
  if (error) throw error
  return data || []
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
  if (error) throw error
  return count ?? 0
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
