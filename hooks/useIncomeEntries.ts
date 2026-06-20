'use client'

import { useState, useEffect, useCallback } from 'react'
import { IncomeEntry, IncomeEntryFormData } from '@/types'
import { getIncomeEntries, createIncomeEntry, updateIncomeEntry, deleteIncomeEntry } from '@/services/incomeEntries'
import { toast } from 'sonner'
import { createActionTrace } from '@/lib/performance'

export function useIncomeEntries(month?: number, year?: number) {
  const [entries, setEntries] = useState<IncomeEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    const trace = createActionTrace('income.refetch', { month, year })
    setIsLoading(true)
    try {
      const data = await trace.step('supabase.select.income_entries', () => getIncomeEntries(month, year))
      await trace.step('local_state.replace', async () => setEntries(data))
    } catch {
      toast.error('Failed to load income')
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

  const addEntry = async (form: IncomeEntryFormData): Promise<IncomeEntry | null> => {
    const trace = createActionTrace('income.add', { status: form.status ?? 'expected' })
    try {
      const entry = await trace.step('service.create_income_entry', () => createIncomeEntry(form))
      await trace.step('local_state.insert', async () => setEntries((prev) => [entry, ...prev]))
      toast.success('Income logged!')
      return entry
    } catch {
      toast.error('Failed to log income')
      return null
    } finally {
      trace.end()
    }
  }

  const editEntry = async (id: string, form: Partial<IncomeEntryFormData>): Promise<IncomeEntry | null> => {
    const trace = createActionTrace('income.edit')
    try {
      const updated = await trace.step('service.update_income_entry', () => updateIncomeEntry(id, form))
      await trace.step('local_state.update', async () => setEntries((prev) => prev.map((e) => (e.id === id ? updated : e))))
      toast.success('Income updated!')
      return updated
    } catch {
      toast.error('Failed to update income')
      return null
    } finally {
      trace.end()
    }
  }

  const removeEntry = async (id: string) => {
    const trace = createActionTrace('income.delete')
    try {
      await trace.step('service.delete_income_entry', () => deleteIncomeEntry(id))
      await trace.step('local_state.remove', async () => setEntries((prev) => prev.filter((e) => e.id !== id)))
      toast.success('Income removed')
    } catch {
      toast.error('Failed to remove income')
    } finally {
      trace.end()
    }
  }

  const markReceived = async (id: string): Promise<void> => {
    const trace = createActionTrace('income.mark_received')
    try {
      const updated = await trace.step('service.update_income_entry', () => updateIncomeEntry(id, { status: 'received' }))
      await trace.step('local_state.update', async () => setEntries((prev) => prev.map((e) => (e.id === id ? updated : e))))
      toast.success('Marked as received!')
    } catch {
      toast.error('Failed to mark as received')
    } finally {
      trace.end()
    }
  }

  return { entries, isLoading, addEntry, editEntry, removeEntry, markReceived }
}
