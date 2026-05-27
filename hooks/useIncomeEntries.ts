'use client'

import { useState, useEffect, useCallback } from 'react'
import { IncomeEntry, IncomeEntryFormData } from '@/types'
import { getIncomeEntries, createIncomeEntry, updateIncomeEntry, deleteIncomeEntry } from '@/services/incomeEntries'
import { toast } from 'sonner'

export function useIncomeEntries(month?: number, year?: number) {
  const [entries, setEntries] = useState<IncomeEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setEntries(await getIncomeEntries(month, year))
    } catch {
      toast.error('Failed to load income')
    } finally {
      setIsLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  const addEntry = async (form: IncomeEntryFormData): Promise<IncomeEntry | null> => {
    try {
      const entry = await createIncomeEntry(form)
      setEntries((prev) => [entry, ...prev])
      toast.success('Income logged!')
      return entry
    } catch {
      toast.error('Failed to log income')
      return null
    }
  }

  const editEntry = async (id: string, form: Partial<IncomeEntryFormData>): Promise<IncomeEntry | null> => {
    try {
      const updated = await updateIncomeEntry(id, form)
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)))
      toast.success('Income updated!')
      return updated
    } catch {
      toast.error('Failed to update income')
      return null
    }
  }

  const removeEntry = async (id: string) => {
    try {
      await deleteIncomeEntry(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
      toast.success('Income removed')
    } catch {
      toast.error('Failed to remove income')
    }
  }

  return { entries, isLoading, addEntry, editEntry, removeEntry }
}
