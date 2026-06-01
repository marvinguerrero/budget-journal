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
  const transferFee = Number(form.transfer_fee ?? 0)

  if (transferFee < 0) {
    throw new Error('Transfer fee cannot be negative.')
  }

  const { data, error } = await supabase.rpc('create_account_transfer_with_fee', {
    p_from_account_id: form.from_account_id,
    p_to_account_id: form.to_account_id,
    p_amount: form.amount,
    p_note: form.note,
    p_transferred_at: form.transferred_at,
    p_transfer_fee: transferFee,
  })

  if (error) throw new Error(error.message)
  return data
}

export async function deleteAccountTransfer(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('account_transfers').delete().eq('id', id)
  if (error) throw error
}
