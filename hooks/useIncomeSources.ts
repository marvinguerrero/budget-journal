'use client'

import { useState, useEffect, useCallback } from 'react'
import { IncomeSource, IncomeSourceFormData } from '@/types'
import { getIncomeSources, createIncomeSource, deleteIncomeSource } from '@/services/incomeSources'
import { toast } from 'sonner'

export function useIncomeSources() {
  const [sources, setSources] = useState<IncomeSource[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setSources(await getIncomeSources())
    } catch {
      toast.error('Failed to load income sources')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addSource = async (form: IncomeSourceFormData): Promise<IncomeSource | null> => {
    try {
      const source = await createIncomeSource(form)
      setSources((prev) => [...prev, source])
      toast.success('Income source added')
      return source
    } catch {
      toast.error('Failed to add income source')
      return null
    }
  }

  const removeSource = async (id: string) => {
    try {
      await deleteIncomeSource(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
      toast.success('Income source removed')
    } catch {
      toast.error('Failed to remove income source')
    }
  }

  return { sources, isLoading, addSource, removeSource }
}
