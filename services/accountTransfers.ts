import { createClient } from '@/lib/supabase/client'
import { AccountTransfer, AccountTransferFormData } from '@/types'

export async function getAccountTransfers(month?: number, year?: number): Promise<AccountTransfer[]> {
  const supabase = createClient()
  let query = supabase
    .from('account_transfers')
    .select('*')
    .order('transferred_at', { ascending: false })

  if (month && year) {
    const start = new Date(year, month - 1, 1).toISOString()
    const end   = new Date(year, month,     0, 23, 59, 59).toISOString()
    query = query.gte('transferred_at', start).lte('transferred_at', end)
  } else if (year) {
    const start = new Date(year, 0, 1).toISOString()
    const end   = new Date(year, 11, 31, 23, 59, 59).toISOString()
    query = query.gte('transferred_at', start).lte('transferred_at', end)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createAccountTransfer(form: AccountTransferFormData): Promise<AccountTransfer> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('account_transfers')
    .insert({ user_id: user.id, ...form })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAccountTransfer(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('account_transfers').delete().eq('id', id)
  if (error) throw error
}
