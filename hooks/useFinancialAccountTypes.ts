'use client'

import { useCallback, useEffect, useState } from 'react'
import { AccountCategory, FinancialAccountType } from '@/types'
import {
  createFinancialAccountType,
  deleteFinancialAccountType,
  getFinancialAccountTypes,
  updateFinancialAccountType,
} from '@/services/financialAccountTypes'
import { toast } from 'sonner'

export function useFinancialAccountTypes() {
  const [accountTypes, setAccountTypes] = useState<FinancialAccountType[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setAccountTypes(await getFinancialAccountTypes())
    } catch {
      toast.error('Failed to load account types')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addAccountType = async (form: { name: string; category: AccountCategory }) => {
    try {
      const type = await createFinancialAccountType(form)
      setAccountTypes((prev) => [...prev, type])
      toast.success('Account type created!')
      return type
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create account type')
      return null
    }
  }

  const editAccountType = async (id: string, form: { name: string; category: AccountCategory }) => {
    try {
      const type = await updateFinancialAccountType(id, form)
      setAccountTypes((prev) => prev.map((item) => item.id === id ? type : item))
      toast.success('Account type updated!')
      return type
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update account type')
      return null
    }
  }

  const removeAccountType = async (id: string) => {
    try {
      await deleteFinancialAccountType(id)
      setAccountTypes((prev) => prev.filter((item) => item.id !== id))
      toast.success('Account type deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account type')
    }
  }

  return { accountTypes, isLoading, addAccountType, editAccountType, removeAccountType, reload: load }
}
