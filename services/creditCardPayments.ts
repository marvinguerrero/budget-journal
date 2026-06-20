import { createClient } from '@/lib/supabase/client'
import { CreditCardPayment } from '@/types'
import { createActionTrace } from '@/lib/performance'

const CREDIT_CARD_PAYMENT_SELECT = `
  id,
  user_id,
  credit_card_account_id,
  source_account_id,
  transfer_id,
  amount,
  remaining_outstanding_after_payment,
  paid_at,
  created_at
`

export async function getCreditCardPayments(): Promise<CreditCardPayment[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('credit_card_payments')
    .select(CREDIT_CARD_PAYMENT_SELECT)
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
  const trace = createActionTrace('service.credit_card_payment.record')
  const supabase = createClient()
  try {
    const { data, error } = await trace.step('supabase.rpc.record_credit_card_payment_with_balance_updates', () =>
      supabase.rpc('record_credit_card_payment', {
        p_credit_card_account_id: payload.creditCardAccountId,
        p_source_account_id: payload.sourceAccountId,
        p_amount: payload.amount,
        p_paid_at: payload.paidAt ?? new Date().toISOString(),
      })
    )

    if (error) throw new Error(error.message)
    return data
  } finally {
    trace.end()
  }
}
