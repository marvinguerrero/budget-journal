import { createClient } from '@/lib/supabase/client'
import { CreditCardPayment } from '@/types'

export async function getCreditCardPayments(): Promise<CreditCardPayment[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('credit_card_payments')
    .select('*')
    .order('paid_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function recordCreditCardPayment(payload: {
  creditCardAccountId: string
  sourceAccountId: string
  amount: number
  paidAt?: string
}): Promise<CreditCardPayment> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('record_credit_card_payment', {
    p_credit_card_account_id: payload.creditCardAccountId,
    p_source_account_id: payload.sourceAccountId,
    p_amount: payload.amount,
    p_paid_at: payload.paidAt ?? new Date().toISOString(),
  })

  if (error) throw new Error(error.message)
  return data
}
