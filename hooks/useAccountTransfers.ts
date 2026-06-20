'use client'

import { useState, useEffect, useCallback } from 'react'
import { AccountTransfer, AccountTransferFormData } from '@/types'
import {
  getAccountTransfers,
  createAccountTransfer,
  deleteAccountTransfer,
} from '@/services/accountTransfers'
import { toast } from 'sonner'
import { createActionTrace } from '@/lib/performance'

export function useAccountTransfers(month?: number, year?: number) {
  const [transfers, setTransfers] = useState<AccountTransfer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    const trace = createActionTrace('transfers.refetch', { month, year })
    setIsLoading(true)
    try {
      const data = await trace.step('supabase.select.account_transfers', () => getAccountTransfers(month, year))
      await trace.step('local_state.replace', async () => setTransfers(data))
    } catch {
      toast.error('Failed to load transfers')
    } finally {
      setIsLoading(false)
      trace.end()
    }
  }, [month, year])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const addTransfer = async (form: AccountTransferFormData): Promise<AccountTransfer | null> => {
    const trace = createActionTrace('transfer.add', { hasFee: Number(form.transfer_fee ?? 0) > 0 })
    try {
      const transfer = await trace.step('service.create_account_transfer', () => createAccountTransfer(form))
      await trace.step('local_state.insert', async () => setTransfers((prev) => [transfer, ...prev]))
      toast.success('Transfer recorded!')
      return transfer
    } catch {
      toast.error('Failed to record transfer')
      return null
    } finally {
      trace.end()
    }
  }

  const removeTransfer = async (id: string) => {
    const trace = createActionTrace('transfer.delete')
    try {
      await trace.step('service.delete_account_transfer', () => deleteAccountTransfer(id))
      await trace.step('local_state.remove', async () => setTransfers((prev) => prev.filter((t) => t.id !== id)))
      toast.success('Transfer removed')
    } catch {
      toast.error('Failed to remove transfer')
    } finally {
      trace.end()
    }
  }

  return { transfers, isLoading, addTransfer, removeTransfer, reload: load }
}
