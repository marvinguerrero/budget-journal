import { createClient } from '@/lib/supabase/client'
import { AccountCategory, FinancialAccountType } from '@/types'

export async function getFinancialAccountTypes(): Promise<FinancialAccountType[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('financial_account_types')
    .select('*')
    .order('is_default', { ascending: false })
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createFinancialAccountType(form: {
  name: string
  category: AccountCategory
}): Promise<FinancialAccountType> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('financial_account_types')
    .insert({
      user_id: user.id,
      name: form.name.trim(),
      category: form.category,
      is_default: false,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateFinancialAccountType(
  id: string,
  form: { name: string; category: AccountCategory }
): Promise<FinancialAccountType> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('financial_account_types')
    .update({
      name: form.name.trim(),
      category: form.category,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteFinancialAccountType(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('delete_financial_account_type', {
    p_type_id: id,
  })
  if (error) throw new Error(error.message)
}
