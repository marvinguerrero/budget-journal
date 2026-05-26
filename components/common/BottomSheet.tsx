'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Lock body scroll while open
  useEffect(() => {
    if (!mounted) return
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open, mounted])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal={open}
      className={cn(
        'fixed inset-0 z-50',
        open ? 'pointer-events-auto' : 'pointer-events-none'
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/50 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />

      {/* Sheet panel — position:fixed for reliable Chrome Android + iOS Safari */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 bg-card rounded-t-3xl flex flex-col z-50',
          'transition-transform duration-300 ease-out will-change-transform',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ maxHeight: '90vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-0 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Scrollable area */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-10"
          style={{ touchAction: 'pan-y' }}
        >
          <h2 className="text-xl font-bold mb-5">{title}</h2>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
