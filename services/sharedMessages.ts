import { createClient } from '@/lib/supabase/client'
import { GroupMessage } from '@/types'

export async function getGroupMessages(groupId: string): Promise<GroupMessage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shared_group_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) throw error
  return data || []
}

export async function deleteGroupMessage(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('shared_group_messages').delete().eq('id', id)
  if (error) throw error
}

export async function sendGroupMessage(groupId: string, message: string): Promise<GroupMessage> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('send_group_message', {
    p_group_id: groupId,
    p_message:  message.trim(),
  })
  if (error) throw new Error(error.message)
  return data as GroupMessage
}
