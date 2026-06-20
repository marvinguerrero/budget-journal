import { createClient } from '@/lib/supabase/client'
import { AccountCategory, FinancialAccountType } from '@/types'

const ACCOUNT_TYPE_SELECT = 'id, user_id, name, category, is_default, created_at, updated_at'
let accountTypeCache: FinancialAccountType[] | null = null

export async function getFinancialAccountTypes(): Promise<FinancialAccountType[]> {
  if (accountTypeCache) return accountTypeCache
  const supabase = createClient()
  const { data, error } = await supabase
    .from('financial_account_types')
    .select(ACCOUNT_TYPE_SELECT)
    .order('is_default', { ascending: false })
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  accountTypeCache = data ?? []
  return accountTypeCache
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
    .select(ACCOUNT_TYPE_SELECT)
    .single()

  if (error) throw error
  accountTypeCache = accountTypeCache ? [...accountTypeCache, data] : null
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
    .select(ACCOUNT_TYPE_SELECT)
    .single()

  if (error) throw error
  accountTypeCache = accountTypeCache ? accountTypeCache.map((type) => type.id === id ? data : type) : null
  return data
}

export async function deleteFinancialAccountType(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('delete_financial_account_type', {
    p_type_id: id,
  })
  if (error) throw new Error(error.message)
  accountTypeCache = accountTypeCache ? accountTypeCache.filter((type) => type.id !== id) : null
}
