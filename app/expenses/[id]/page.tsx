'use client'

import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ExpenseDetailsView } from '@/components/expenses/ExpenseDetailsView'
import { ArrowLeft } from 'lucide-react'

export default function ExpenseDetailsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const expenseId = params.id

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 p-4 backdrop-blur">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Expenses
        </Button>
      </div>
      <ExpenseDetailsView
        expenseId={expenseId}
        onDeleted={() => router.push('/expenses')}
      />
    </div>
  )
}
