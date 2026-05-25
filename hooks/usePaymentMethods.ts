'use client'

import { useState, useEffect, useCallback } from 'react'
import { useExpenseStore } from '@/store/useExpenseStore'
import {
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod as updatePMService,
  deletePaymentMethod,
} from '@/services/paymentMethods'
import { PaymentMethodFormData } from '@/types'
import { toast } from 'sonner'

export function usePaymentMethods() {
  const {
    paymentMethods,
    setPaymentMethods,
    addPaymentMethod,
    updatePaymentMethod: updateStore,
    removePaymentMethod,
  } = useExpenseStore()
  const [isLoading, setIsLoading] = useState(false)

  const fetchPaymentMethods = useCallback(async () => {
    if (paymentMethods.length > 0) return
    setIsLoading(true)
    try {
      const data = await getPaymentMethods()
      setPaymentMethods(data)
    } catch {
      toast.error('Failed to load payment methods')
    } finally {
      setIsLoading(false)
    }
  }, [paymentMethods.length, setPaymentMethods])

  useEffect(() => {
    fetchPaymentMethods()
  }, [fetchPaymentMethods])

  const handleCreate = async (formData: PaymentMethodFormData) => {
    try {
      const newPM = await createPaymentMethod(formData)
      addPaymentMethod(newPM)
      toast.success(`"${formData.name}" added`)
      return newPM
    } catch {
      toast.error('Failed to add payment method')
      throw new Error('Failed to add payment method')
    }
  }

  const handleUpdate = async (id: string, formData: Partial<PaymentMethodFormData>) => {
    try {
      const updated = await updatePMService(id, formData)
      updateStore(id, updated)
      toast.success('Payment method updated')
      return updated
    } catch {
      toast.error('Failed to update payment method')
      throw new Error('Failed to update payment method')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    try {
      await deletePaymentMethod(id)
      removePaymentMethod(id)
      toast.success(`"${name}" deleted`)
    } catch {
      toast.error('Failed to delete payment method')
      throw new Error('Failed to delete payment method')
    }
  }

  return {
    paymentMethods,
    isLoading,
    refetch: () => { useExpenseStore.getState().setPaymentMethods([]); fetchPaymentMethods() },
    createPaymentMethod: handleCreate,
    updatePaymentMethod: handleUpdate,
    deletePaymentMethod: handleDelete,
  }
}
