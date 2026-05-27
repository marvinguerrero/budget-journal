import { createClient } from '@/lib/supabase/client'
import { PermissionRequest } from '@/types'

export async function createPermissionRequest(
  groupId: string,
  type: 'edit_access' | 'invite_permission'
): Promise<PermissionRequest> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('create_permission_request', {
    p_group_id: groupId,
    p_type: type,
  })
  if (error) throw error
  return data as PermissionRequest
}

export async function approvePermissionRequest(requestId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('approve_permission_request', { p_request_id: requestId })
  if (error) throw error
}

export async function rejectPermissionRequest(requestId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('reject_permission_request', { p_request_id: requestId })
  if (error) throw error
}
