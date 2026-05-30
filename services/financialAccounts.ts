import { createClient } from '@/lib/supabase/client'
import { FinancialAccount, FinancialAccountFormData } from '@/types'
import { isLiabilityType } from '@/lib/constants'

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
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('financial_accounts')
    .insert({ user_id: user.id, ...form, category: form.category ?? deriveCategory(form.type) })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateFinancialAccount(
  id: string,
  form: Partial<FinancialAccountFormData>
): Promise<FinancialAccount> {
  const supabase = createClient()
  const updates = form.type
    ? { ...form, category: form.category ?? deriveCategory(form.type) }
    : form
  const { data, error } = await supabase
    .from('financial_accounts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteFinancialAccount(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('financial_accounts').delete().eq('id', id)
  if (error) throw error
}
