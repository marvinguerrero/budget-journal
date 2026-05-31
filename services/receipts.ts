import { createClient } from '@/lib/supabase/client'

const RECEIPT_BUCKET = 'receipts'
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024
const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
])

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/pdf': 'pdf',
}

export function isReceiptPreviewImage(pathOrType: string) {
  const value = pathOrType.toLowerCase()
  return value.includes('image/')
    || value.endsWith('.jpg')
    || value.endsWith('.jpeg')
    || value.endsWith('.png')
    || value.endsWith('.heic')
    || value.endsWith('.heif')
}

function getReceiptExtension(file: File) {
  const fromType = EXTENSION_BY_TYPE[file.type]
  if (fromType) return fromType

  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'heic' || extension === 'pdf') {
    return extension
  }

  return null
}

function getReceiptContentType(file: File) {
  if (ALLOWED_RECEIPT_TYPES.has(file.type)) return file.type

  const extension = getReceiptExtension(file)
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'heic') return 'image/heic'
  if (extension === 'pdf') return 'application/pdf'

  return undefined
}

export function validateReceiptFile(file: File) {
  if (file.size > MAX_RECEIPT_SIZE) {
    throw new Error('Receipt must be 10 MB or smaller.')
  }

  if (!ALLOWED_RECEIPT_TYPES.has(file.type)) {
    const extension = getReceiptExtension(file)
    if (!extension) {
      throw new Error('Receipt must be a JPG, PNG, HEIC, or PDF file.')
    }
  }
}

export async function uploadExpenseReceipt(params: {
  userId: string
  expenseId: string
  createdAt: string
  file: File
}) {
  validateReceiptFile(params.file)

  const supabase = createClient()
  const createdAt = new Date(params.createdAt)
  const year = String(createdAt.getFullYear())
  const month = String(createdAt.getMonth() + 1).padStart(2, '0')
  const extension = getReceiptExtension(params.file) ?? 'jpg'
  const timestamp = Date.now()
  const path = `${params.userId}/${year}/${month}/${params.expenseId}-${timestamp}.${extension}`

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, params.file, {
      cacheControl: '3600',
      contentType: getReceiptContentType(params.file),
      upsert: false,
    })

  if (error) throw new Error(error.message)
  return path
}

export async function deleteReceiptFile(path?: string | null) {
  if (!path) return

  const supabase = createClient()
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).remove([path])
  if (error) throw new Error(error.message)
}

export async function getReceiptSignedUrl(path: string) {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, 60 * 5)

  if (error) throw new Error(error.message)
  return data.signedUrl
}
