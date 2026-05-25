'use client'

import { useState, useEffect, useCallback } from 'react'
import { useExpenseStore } from '@/store/useExpenseStore'
import {
  getCategories,
  createCategory,
  updateCategory as updateCategoryService,
  deleteCategory,
} from '@/services/categories'
import { CategoryFormData } from '@/types'
import { toast } from 'sonner'

export function useCategories() {
  const {
    categories,
    setCategories,
    addCategory,
    updateCategory: updateStore,
    removeCategory,
  } = useExpenseStore()
  const [isLoading, setIsLoading] = useState(false)

  const fetchCategories = useCallback(async () => {
    if (categories.length > 0) return // already loaded
    setIsLoading(true)
    try {
      const data = await getCategories()
      setCategories(data)
    } catch {
      toast.error('Failed to load categories')
    } finally {
      setIsLoading(false)
    }
  }, [categories.length, setCategories])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const handleCreate = async (formData: CategoryFormData) => {
    try {
      const newCat = await createCategory(formData)
      addCategory(newCat)
      toast.success(`"${formData.name}" category added`)
      return newCat
    } catch {
      toast.error('Failed to add category')
      throw new Error('Failed to add category')
    }
  }

  const handleUpdate = async (id: string, formData: Partial<CategoryFormData>) => {
    try {
      const updated = await updateCategoryService(id, formData)
      updateStore(id, updated)
      toast.success('Category updated')
      return updated
    } catch {
      toast.error('Failed to update category')
      throw new Error('Failed to update category')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteCategory(id)
      removeCategory(id)
      toast.success(`"${name}" deleted`)
    } catch {
      toast.error('Failed to delete category')
      throw new Error('Failed to delete category')
    }
  }

  return {
    categories,
    isLoading,
    refetch: () => { useExpenseStore.getState().setCategories([]); fetchCategories() },
    createCategory: handleCreate,
    updateCategory: handleUpdate,
    deleteCategory: handleDelete,
  }
}
