import { createClient } from '@/lib/supabase/client'
import { PaymentMethod, PaymentMethodFormData } from '@/types'

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createPaymentMethod(formData: PaymentMethodFormData): Promise<PaymentMethod> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('payment_methods')
    .insert({ user_id: user.id, ...formData, is_default: false })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updatePaymentMethod(id: string, formData: Partial<PaymentMethodFormData>): Promise<PaymentMethod> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payment_methods')
    .update(formData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deletePaymentMethod(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('payment_methods').delete().eq('id', id)
  if (error) throw error
}
