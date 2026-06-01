import { createClient } from '@/lib/supabase/client'
import { Loan, LoanFormData, LoanPayment, LoanPaymentFormData, LoanRequest } from '@/types'

export async function getLoans(): Promise<{ loans: Loan[]; payments: LoanPayment[]; requests: LoanRequest[] }> {
  const supabase = createClient()
  const [{ data: loans, error: loansError }, { data: payments, error: paymentsError }, { data: requests, error: requestsError }] =
    await Promise.all([
      supabase.from('loans').select('*').order('loan_date', { ascending: false }),
      supabase.from('loan_payments').select('*').order('paid_at', { ascending: false }),
      supabase.from('loan_requests').select('*').order('requested_at', { ascending: false }),
    ])

  if (loansError) throw loansError
  if (paymentsError) throw paymentsError
  if (requestsError) throw requestsError

  return {
    loans: loans ?? [],
    payments: payments ?? [],
    requests: requests ?? [],
  }
}

export async function createLoan(form: LoanFormData): Promise<Loan | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('create_loan', {
    p_loan_type: form.loan_type,
    p_person_name: form.person_name,
    p_amount: form.amount,
    p_account_id: form.account_id,
    p_loan_date: form.loan_date,
    p_due_date: form.due_date || null,
    p_notes: form.notes ?? '',
    p_contact_id: form.contact_id ?? null,
    p_contact_user_id: form.contact_user_id ?? null,
    p_person_email: form.person_email ?? null,
    p_counterparty_kind: form.counterparty_kind,
    p_person_phone: form.person_phone ?? null,
    p_transfer_fee: form.transfer_fee ?? 0,
    p_fee_responsibility: form.fee_responsibility ?? 'lender',
  })

  if (error) throw new Error(error.message)
  return data
}

export async function recordLoanPayment(form: LoanPaymentFormData): Promise<LoanPayment> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('record_loan_payment', {
    p_loan_id: form.loan_id,
    p_amount: form.amount,
    p_account_id: form.account_id,
    p_paid_at: form.paid_at ?? new Date().toISOString(),
    p_note: form.note ?? '',
  })

  if (error) throw new Error(error.message)
  return data
}

export async function cancelLoan(id: string): Promise<Loan> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('cancel_loan', {
    p_loan_id: id,
  })

  if (error) throw new Error(error.message)
  return data
}

export async function approveLoanRequest(requestId: string, lenderAccountId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('approve_loan_request', {
    p_request_id: requestId,
    p_lender_account_id: lenderAccountId,
  })
  if (error) throw new Error(error.message)
}

export async function rejectLoanRequest(requestId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('reject_loan_request', {
    p_request_id: requestId,
  })
  if (error) throw new Error(error.message)
}

export async function cancelLoanRequest(requestId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('cancel_loan_request', {
    p_request_id: requestId,
  })
  if (error) throw new Error(error.message)
}
