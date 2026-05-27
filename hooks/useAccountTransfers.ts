'use client'

import { useState, useEffect, useCallback } from 'react'
import { AccountTransfer, AccountTransferFormData } from '@/types'
import {
  getAccountTransfers,
  createAccountTransfer,
  deleteAccountTransfer,
} from '@/services/accountTransfers'
import { toast } from 'sonner'

export function useAccountTransfers(month?: number, year?: number) {
  const [transfers, setTransfers] = useState<AccountTransfer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setTransfers(await getAccountTransfers(month, year))
    } catch {
      toast.error('Failed to load transfers')
    } finally {
      setIsLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  const addTransfer = async (form: AccountTransferFormData): Promise<AccountTransfer | null> => {
    try {
      const transfer = await createAccountTransfer(form)
      setTransfers((prev) => [transfer, ...prev])
      toast.success('Transfer recorded!')
      return transfer
    } catch {
      toast.error('Failed to record transfer')
      return null
    }
  }

  const removeTransfer = async (id: string) => {
    try {
      await deleteAccountTransfer(id)
      setTransfers((prev) => prev.filter((t) => t.id !== id))
      toast.success('Transfer removed')
    } catch {
      toast.error('Failed to remove transfer')
    }
  }

  return { transfers, isLoading, addTransfer, removeTransfer, reload: load }
}
