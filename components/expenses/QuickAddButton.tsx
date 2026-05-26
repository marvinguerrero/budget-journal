'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BottomSheet } from '@/components/common/BottomSheet'
import { ExpenseForm } from './ExpenseForm'
import { ExpenseFormData } from '@/types'
import { useIsMobile } from '@/hooks/useIsMobile'

interface QuickAddButtonProps {
  onAdd: (data: ExpenseFormData) => Promise<unknown>
}

export function QuickAddButton({ onAdd }: QuickAddButtonProps) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()

  const handleSubmit = async (data: ExpenseFormData) => {
    await onAdd(data)
    setOpen(false)
  }

  const form = (
    <ExpenseForm onSubmit={handleSubmit} onCancel={() => setOpen(false)} />
  )

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="lg"
        className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 z-50 h-14 w-14 rounded-full shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:scale-110 p-0"
      >
        <Plus className="h-6 w-6" />
        <span className="sr-only">Add expense</span>
      </Button>

      {isMobile ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Add Expense">
          {form}
        </BottomSheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Add Expense</DialogTitle>
            </DialogHeader>
            {form}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
