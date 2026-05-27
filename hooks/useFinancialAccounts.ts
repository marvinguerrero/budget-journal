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

export function useFinancialAccounts() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setAccounts(await getFinancialAccounts())
    } catch {
      toast.error('Failed to load accounts')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addAccount = async (form: FinancialAccountFormData): Promise<FinancialAccount | null> => {
    try {
      const account = await createFinancialAccount(form)
      setAccounts((prev) => [...prev, account])
      toast.success('Account created!')
      return account
    } catch {
      toast.error('Failed to create account')
      return null
    }
  }

  const editAccount = async (id: string, form: Partial<FinancialAccountFormData>): Promise<FinancialAccount | null> => {
    try {
      const updated = await updateFinancialAccount(id, form)
      setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)))
      toast.success('Account updated!')
      return updated
    } catch {
      toast.error('Failed to update account')
      return null
    }
  }

  const removeAccount = async (id: string) => {
    try {
      await deleteFinancialAccount(id)
      setAccounts((prev) => prev.filter((a) => a.id !== id))
      toast.success('Account removed')
    } catch {
      toast.error('Failed to remove account')
    }
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  return { accounts, isLoading, totalBalance, addAccount, editAccount, removeAccount, reload: load }
}
