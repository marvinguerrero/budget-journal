'use client'

import { useState, useEffect, useCallback } from 'react'
import { FinancialAccount, FinancialAccountFormData } from '@/types'
import {
  getFinancialAccounts,
  createFinancialAccount,
  updateFinancialAccount,
  deleteFinancialAccount,
} from '@/services/financialAccounts'
import { toast } from 'sonner'
import { createActionTrace } from '@/lib/performance'

export function useFinancialAccounts() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    const trace = createActionTrace('accounts.refetch')
    setIsLoading(true)
    try {
      const data = await trace.step('supabase.select.financial_accounts', () => getFinancialAccounts())
      await trace.step('local_state.replace', async () => setAccounts(data))
    } catch {
      toast.error('Failed to load accounts')
    } finally {
      setIsLoading(false)
      trace.end()
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const addAccount = async (form: FinancialAccountFormData): Promise<FinancialAccount | null> => {
    const trace = createActionTrace('account.add', { type: form.type, category: form.category })
    try {
      const account = await trace.step('service.create_financial_account', () => createFinancialAccount(form))
      await trace.step('local_state.insert', async () => setAccounts((prev) => [...prev, account]))
      toast.success('Account created!')
      return account
    } catch {
      toast.error('Failed to create account')
      return null
    } finally {
      trace.end()
    }
  }

  const editAccount = async (id: string, form: Partial<FinancialAccountFormData>): Promise<FinancialAccount | null> => {
    const trace = createActionTrace('account.edit', { type: form.type, category: form.category })
    try {
      const updated = await trace.step('service.update_financial_account', () => updateFinancialAccount(id, form))
      await trace.step('local_state.update', async () => setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a))))
      toast.success('Account updated!')
      return updated
    } catch {
      toast.error('Failed to update account')
      return null
    } finally {
      trace.end()
    }
  }

  const removeAccount = async (id: string) => {
    const trace = createActionTrace('account.delete')
    try {
      await trace.step('service.delete_financial_account', () => deleteFinancialAccount(id))
      await trace.step('local_state.remove', async () => setAccounts((prev) => prev.filter((a) => a.id !== id)))
      toast.success('Account removed')
    } catch {
      toast.error('Failed to remove account')
    } finally {
      trace.end()
    }
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  return { accounts, isLoading, totalBalance, addAccount, editAccount, removeAccount, reload: load }
}
