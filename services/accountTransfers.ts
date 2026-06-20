import { createClient } from '@/lib/supabase/client'
import { AccountTransfer, AccountTransferFormData } from '@/types'
import { createActionTrace } from '@/lib/performance'

const ACCOUNT_TRANSFER_SELECT = `
  id,
  user_id,
  from_account_id,
  to_account_id,
  amount,
  transfer_fee,
  fee_expense_id,
  note,
  transferred_at,
  created_at,
  destination_amount,
  source_currency,
  destination_currency,
  exchange_rate
`

type RpcResult<T> = {
  data: T
  error: { message: string } | null
}

export async function getAccountTransfers(month?: number, year?: number): Promise<AccountTransfer[]> {
  const supabase = createClient()
  let query = supabase
    .from('account_transfers')
    .select(ACCOUNT_TRANSFER_SELECT)
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
  const trace = createActionTrace('service.transfer.create', { hasFee: Number(form.transfer_fee ?? 0) > 0 })
  const supabase = createClient()
  const transferFee = Number(form.transfer_fee ?? 0)

  try {
    if (transferFee < 0) {
      throw new Error('Transfer fee cannot be negative.')
    }

    const { data, error } = await trace.step<RpcResult<AccountTransfer>>('supabase.rpc.create_transfer_with_balance_updates', async () =>
      await supabase.rpc('create_account_transfer_with_fee', {
        p_from_account_id: form.from_account_id,
        p_to_account_id: form.to_account_id,
        p_amount: form.amount,
        p_note: form.note,
        p_transferred_at: form.transferred_at,
        p_transfer_fee: transferFee,
        p_destination_amount: form.destination_amount ?? null,
      }) as unknown as RpcResult<AccountTransfer>
    )

    if (error) throw new Error(error.message)
    return data
  } finally {
    trace.end()
  }
}

export async function deleteAccountTransfer(id: string): Promise<void> {
  const trace = createActionTrace('service.transfer.delete')
  const supabase = createClient()
  try {
    const { error } = await trace.step('supabase.delete.account_transfer', () =>
      supabase.from('account_transfers').delete().eq('id', id)
    )
    if (error) throw error
  } finally {
    trace.end()
  }
}
