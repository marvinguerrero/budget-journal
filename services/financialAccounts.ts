import { createClient } from '@/lib/supabase/client'
import { FinancialAccount, FinancialAccountFormData } from '@/types'
import { isLiabilityType } from '@/lib/constants'
import { createActionTrace } from '@/lib/performance'

function deriveCategory(type: string) {
  return isLiabilityType(type) ? 'liability' : 'asset'
}

export async function getFinancialAccounts(): Promise<FinancialAccount[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createFinancialAccount(form: FinancialAccountFormData): Promise<FinancialAccount> {
  const trace = createActionTrace('service.account.create', { type: form.type, category: form.category })
  const supabase = createClient()
  try {
    const { data: { user } } = await trace.step('supabase.auth.get_user', () => supabase.auth.getUser())
    if (!user) throw new Error('Not authenticated')
    const { data, error } = await trace.step('supabase.insert.financial_account', () =>
      supabase
        .from('financial_accounts')
        .insert({ user_id: user.id, ...form, category: form.category ?? deriveCategory(form.type) })
        .select()
        .single()
    )
    if (error) throw error
    return data
  } finally {
    trace.end()
  }
}

export async function updateFinancialAccount(
  id: string,
  form: Partial<FinancialAccountFormData>
): Promise<FinancialAccount> {
  const trace = createActionTrace('service.account.update', { type: form.type, category: form.category })
  const supabase = createClient()
  const updates = form.type
    ? { ...form, category: form.category ?? deriveCategory(form.type) }
    : form
  try {
    const { data, error } = await trace.step('supabase.update.financial_account', () =>
      supabase
        .from('financial_accounts')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
    )
    if (error) throw error
    return data
  } finally {
    trace.end()
  }
}

export async function deleteFinancialAccount(id: string): Promise<void> {
  const trace = createActionTrace('service.account.delete')
  const supabase = createClient()
  try {
    const { error } = await trace.step('supabase.delete.financial_account', () =>
      supabase.from('financial_accounts').delete().eq('id', id)
    )
    if (error) throw error
  } finally {
    trace.end()
  }
}
