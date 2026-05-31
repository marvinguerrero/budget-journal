'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Camera,
  Download,
  Eye,
  FileText,
  Paperclip,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  getReceiptSignedUrl,
  isReceiptPreviewImage,
  validateReceiptFile,
} from '@/services/receipts'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const ACCEPTED_RECEIPT_TYPES = 'image/jpeg,image/png,image/heic,image/heif,application/pdf'

interface ReceiptFieldProps {
  existingPath?: string | null
  hasExistingReceipt?: boolean
  selectedFile: File | null
  removeExisting: boolean
  onFileChange: (file: File | null) => void
  onRemoveExistingChange: (remove: boolean) => void
  disabled?: boolean
}

export function ReceiptField({
  existingPath,
  hasExistingReceipt,
  selectedFile,
  removeExisting,
  onFileChange,
  onRemoveExistingChange,
  disabled,
}: ReceiptFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false)
  const hasReceipt = Boolean(hasExistingReceipt && existingPath && !removeExisting)

  const selectFile = (file?: File) => {
    if (!file) return
    try {
      validateReceiptFile(file)
      onFileChange(file)
      onRemoveExistingChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid receipt file')
    }
  }

  const openReceipt = async (download = false) => {
    if (!existingPath) return
    setIsLoadingReceipt(true)
    try {
      const signedUrl = await getReceiptSignedUrl(existingPath)
      if (download) {
        const link = document.createElement('a')
        link.href = signedUrl
        link.download = existingPath.split('/').pop() ?? 'receipt'
        link.rel = 'noopener noreferrer'
        document.body.appendChild(link)
        link.click()
        link.remove()
        return
      }

      if (isReceiptPreviewImage(existingPath)) {
        setPreviewUrl(signedUrl)
        setIsPreviewOpen(true)
      } else {
        window.open(signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open receipt')
    } finally {
      setIsLoadingReceipt(false)
    }
  }

  const clearSelectedFile = () => {
    onFileChange(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const markReceiptForDeletion = () => {
    clearSelectedFile()
    onRemoveExistingChange(true)
  }

  const restoreExistingReceipt = () => {
    clearSelectedFile()
    onRemoveExistingChange(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Receipt</p>
        <p className="text-xs text-muted-foreground">Optional</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        {selectedFile ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Paperclip className="h-3.5 w-3.5" />
                <span className="truncate">{selectedFile.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Will upload when the expense is saved.
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={clearSelectedFile} disabled={disabled}>
              <X className="h-4 w-4" />
              <span className="sr-only">Remove selected receipt</span>
            </Button>
          </div>
        ) : hasReceipt ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => openReceipt(false)} disabled={disabled || isLoadingReceipt}>
              <Eye className="h-3.5 w-3.5" />
              View
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => openReceipt(true)} disabled={disabled || isLoadingReceipt}>
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            <button
              type="button"
              className={uploadButtonClass}
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Replace
            </button>
            <Button type="button" variant="destructive" size="sm" onClick={markReceiptForDeletion} disabled={disabled}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        ) : removeExisting ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Receipt will be deleted when saved.</p>
            <Button type="button" variant="outline" size="sm" onClick={restoreExistingReceipt} disabled={disabled}>
              Undo
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              JPG, PNG, HEIC, or PDF up to 10 MB.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={uploadButtonClass}
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Receipt
              </button>
              <button
                type="button"
                className={cn(uploadButtonClass, 'sm:hidden')}
                onClick={() => cameraInputRef.current?.click()}
                disabled={disabled}
              >
                <Camera className="h-3.5 w-3.5" />
                Camera
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_RECEIPT_TYPES}
          className="hidden"
          onChange={(event) => selectFile(event.target.files?.[0])}
          disabled={disabled}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => selectFile(event.target.files?.[0])}
          disabled={disabled}
        />
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Receipt Preview
            </DialogTitle>
          </DialogHeader>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Receipt preview"
              className="max-h-[70vh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

const uploadButtonClass = cn(
  'inline-flex h-7 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)]',
  'border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all',
  'hover:bg-muted disabled:pointer-events-none disabled:opacity-50'
)
