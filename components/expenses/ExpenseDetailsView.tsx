'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ExpenseForm } from './ExpenseForm'
import {
  deleteExpense,
  getExpenseDetails,
  updateExpense,
} from '@/services/expenses'
import {
  getReceiptSignedUrl,
  isReceiptPreviewImage,
  validateReceiptFile,
} from '@/services/receipts'
import { ExpenseDetailsData, ExpenseFormData } from '@/types'
import { formatCurrency } from '@/utils/format'
import { isLiabilityType } from '@/lib/constants'
import {
  Camera,
  Download,
  Eye,
  FileText,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react'

const ACCEPTED_RECEIPT_TYPES = 'image/jpeg,image/png,image/heic,image/heif,application/pdf'

interface ExpenseDetailsViewProps {
  expenseId: string
  onClose?: () => void
  onChanged?: () => void
  onDeleted?: () => void
}

export function ExpenseDetailsView({
  expenseId,
  onClose,
  onChanged,
  onDeleted,
}: ExpenseDetailsViewProps) {
  const router = useRouter()
  const [details, setDetails] = useState<ExpenseDetailsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)

  const loadDetails = async () => {
    setIsLoading(true)
    try {
      setDetails(await getExpenseDetails(expenseId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load expense details')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      setIsLoading(true)
      getExpenseDetails(expenseId)
        .then((nextDetails) => {
          if (!cancelled) setDetails(nextDetails)
        })
        .catch((error) => {
          if (!cancelled) {
            toast.error(error instanceof Error ? error.message : 'Failed to load expense details')
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [expenseId])

  const handleEdit = async (formData: ExpenseFormData) => {
    await updateExpense(expenseId, formData)
    setEditOpen(false)
    await loadDetails()
    onChanged?.()
    toast.success('Expense updated')
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this expense?')) return
    await deleteExpense(expenseId)
    toast.success('Expense deleted')
    onDeleted?.()
    onClose?.()
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-6 w-40 rounded-md bg-muted animate-pulse" />
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
      </div>
    )
  }

  if (!details) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Expense details could not be loaded.
      </div>
    )
  }

  const { expense, account, sharedBudget, obligation } = details
  const isCreditCard = account && isLiabilityType(account.type)

  return (
    <div className="p-4 lg:p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expense Details</p>
          <h1 className="mt-1 truncate text-xl font-bold">{expense.note || expense.category}</h1>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(expense.amount)}</p>
        </div>
        {onClose && (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <Section title="Expense Information">
        <DetailRow label="Description" value={expense.note || expense.category} />
        <DetailRow label="Amount" value={formatCurrency(expense.amount)} />
        <DetailRow label="Category" value={expense.category} />
        <DetailRow label="Date" value={formatDate(expense.created_at)} />
        <DetailRow label="Account Source" value={account ? `${account.emoji} ${account.name}` : 'No account'} />
        <DetailRow label="Payment Method" value={account ? account.type : 'Not specified'} />
        <DetailRow label="Notes" value={expense.note || 'None'} />
        <DetailRow label="Created Date" value={formatDateTime(expense.created_at)} />
        <DetailRow label="Last Updated Date" value={expense.updated_at ? formatDateTime(expense.updated_at) : 'Not tracked'} />
      </Section>

      <ReceiptDetailsSection
        expenseId={expense.id}
        receiptPath={expense.receipt_path ?? null}
        hasReceipt={expense.has_receipt === true}
        onChanged={async () => {
          await loadDetails()
          onChanged?.()
        }}
      />

      {isCreditCard && account && (
        <Section title="Credit Card Information">
          <DetailRow label="Card" value={account.name} />
          <DetailRow label="Credit Limit" value={account.credit_limit ? formatCurrency(account.credit_limit) : 'Not configured'} />
          <DetailRow label="Available Credit" value={account.credit_limit ? formatCurrency(Math.max(0, account.credit_limit - Math.abs(account.balance))) : 'Not configured'} />
          <DetailRow label="Statement Date" value={formatOptionalDate(account.current_statement_date)} />
          <DetailRow label="Due Date" value={formatOptionalDate(account.current_due_date)} />
          <DetailRow label="Billing Cycle" value={formatBillingCycle(expense)} />
        </Section>
      )}

      {sharedBudget && (
        <Section title="Shared Budget Information">
          <DetailRow label="Group" value={sharedBudget.group_name} />
          <DetailRow label="Category" value={sharedBudget.category} />
          <DetailRow label="Item" value={sharedBudget.item} />
          <DetailRow label="Budget" value={formatCurrency(sharedBudget.budget_amount)} />
          <DetailRow label="Actual" value={formatCurrency(sharedBudget.actual_spent)} />
          <DetailRow label="Remaining" value={formatCurrency(sharedBudget.remaining_budget)} />
        </Section>
      )}

      {obligation && (
        <Section title="Balance Information">
          <DetailRow label="Type" value={obligation.direction === 'owed_to_user' ? "You're Owed" : 'You Owe'} />
          <DetailRow label="Contact" value={obligation.contact_name} />
          <DetailRow label="Original Amount" value={formatCurrency(obligation.amount)} />
          <DetailRow label="Remaining Amount" value={formatCurrency(obligation.remaining_amount)} />
          <DetailRow label="Status" value={getObligationStatus(obligation)} />
        </Section>
      )}

      <Section title="Actions">
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit Expense
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            Delete Expense
          </Button>
        </div>
      </Section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          <ExpenseForm
            onSubmit={handleEdit}
            onCancel={() => setEditOpen(false)}
            initialData={{
              amount: expense.amount,
              category: expense.category,
              note: expense.note,
              account_id: expense.account_id,
              created_at: expense.created_at,
              obligation_type: obligation ? 'owe_me' : 'normal',
              contact_id: obligation?.contact_id,
              contact_user_id: obligation?.contact_user_id,
              contact_name: obligation?.contact_name,
              contact_email: obligation?.contact_email,
              receipt_path: expense.receipt_path,
              has_receipt: expense.has_receipt,
            }}
            isEditing
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReceiptDetailsSection({
  expenseId,
  receiptPath,
  hasReceipt,
  onChanged,
}: {
  expenseId: string
  receiptPath: string | null
  hasReceipt: boolean
  onChanged: () => Promise<void>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const openReceipt = async (download = false) => {
    if (!receiptPath) return
    setIsBusy(true)
    try {
      const signedUrl = await getReceiptSignedUrl(receiptPath)
      if (download) {
        const link = document.createElement('a')
        link.href = signedUrl
        link.download = receiptPath.split('/').pop() ?? 'receipt'
        link.rel = 'noopener noreferrer'
        document.body.appendChild(link)
        link.click()
        link.remove()
        return
      }

      if (isReceiptPreviewImage(receiptPath)) {
        setPreviewUrl(signedUrl)
        setPreviewOpen(true)
      } else {
        window.open(signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open receipt')
    } finally {
      setIsBusy(false)
    }
  }

  const handleReceiptFile = async (file?: File) => {
    if (!file) return
    setIsBusy(true)
    try {
      validateReceiptFile(file)
      await updateExpense(expenseId, { receipt_file: file })
      await onChanged()
      toast.success(hasReceipt ? 'Receipt replaced' : 'Receipt uploaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save receipt')
    } finally {
      setIsBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  const handleDeleteReceipt = async () => {
    if (!window.confirm('Delete this receipt?')) return
    setIsBusy(true)
    try {
      await updateExpense(expenseId, { remove_receipt: true })
      await onChanged()
      toast.success('Receipt deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete receipt')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Section title="Receipt">
      {hasReceipt && receiptPath ? (
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-primary" />
            Receipt Attached
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => openReceipt(false)} disabled={isBusy}>
              <Eye className="h-4 w-4" />
              Preview
            </Button>
            <Button type="button" variant="outline" onClick={() => openReceipt(true)} disabled={isBusy}>
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
              <RotateCcw className="h-4 w-4" />
              Replace
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeleteReceipt} disabled={isBusy}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No receipt attached.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
              <Upload className="h-4 w-4" />
              Upload Receipt
            </Button>
            <Button type="button" variant="outline" className="sm:hidden" onClick={() => cameraInputRef.current?.click()} disabled={isBusy}>
              <Camera className="h-4 w-4" />
              Camera
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_RECEIPT_TYPES}
        className="hidden"
        onChange={(event) => handleReceiptFile(event.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => handleReceiptFile(event.target.files?.[0])}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Receipt Preview</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Receipt preview" className="max-h-[70vh] w-full rounded-xl object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-bold">{title}</h2>
      {children}
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-sm">
      <p className="text-muted-foreground">{label}</p>
      <div className="min-w-0 font-medium break-words">{value}</div>
    </div>
  )
}

function formatDate(value: string) {
  return format(new Date(value), 'MMM d, yyyy')
}

function formatDateTime(value: string) {
  return format(new Date(value), 'MMM d, yyyy h:mm a')
}

function formatOptionalDate(value?: string | null) {
  return value ? formatDate(value) : 'Not configured'
}

function formatBillingCycle(expense: ExpenseDetailsData['expense']) {
  if (expense.credit_billing_cycle_start && expense.credit_billing_cycle_end) {
    return `${formatDate(expense.credit_billing_cycle_start)} - ${formatDate(expense.credit_billing_cycle_end)}`
  }
  return 'Not available'
}

function getObligationStatus(obligation: ExpenseDetailsData['obligation']) {
  if (!obligation) return 'None'
  if (obligation.remaining_amount <= 0.005 || obligation.status === 'settled') return 'Settled'
  if (obligation.remaining_amount < obligation.amount) return 'Partially Settled'
  return 'Open'
}
