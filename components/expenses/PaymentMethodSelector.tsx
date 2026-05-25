'use client'

import { useMemo, useState, useRef } from 'react'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useExpenseStore } from '@/store/useExpenseStore'
import { DEFAULT_PAYMENT_METHODS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Plus, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const QUICK_EMOJIS = [
  '💵','💳','📱','🏦','💸','🏧','💰','🪙',
  '💴','💶','💷','🔵','🟡','🟠','💎','🔑',
  '📲','🤑','💹','🎴','🧾','🏪','🛒','💬',
]

interface PaymentMethodSelectorProps {
  value: string
  onChange: (value: string) => void
}

export function PaymentMethodSelector({ value, onChange }: PaymentMethodSelectorProps) {
  const { paymentMethods, isLoading, createPaymentMethod } = usePaymentMethods()
  const expenses = useExpenseStore((s) => s.expenses)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('💳')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const recentNames = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const e of expenses) {
      if (e.payment_method && !seen.has(e.payment_method)) {
        seen.add(e.payment_method)
        result.push(e.payment_method)
      }
      if (result.length === 3) break
    }
    return result
  }, [expenses])

  const allMethods =
    paymentMethods.length > 0
      ? paymentMethods
      : DEFAULT_PAYMENT_METHODS.map((m, i) => ({
          ...m,
          id: `default-${i}`,
          user_id: null,
          is_default: true,
          created_at: '',
        }))

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setIsSaving(true)
    try {
      const pm = await createPaymentMethod({ name, emoji: newEmoji })
      onChange(pm.name)
      setCreateOpen(false)
      setNewName('')
      setNewEmoji('💳')
    } finally {
      setIsSaving(false)
    }
  }

  const openCreate = () => {
    setCreateOpen(true)
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  const Chip = ({ name, emoji }: { name: string; emoji: string }) => (
    <button
      type="button"
      onClick={() => onChange(value === name ? '' : name)}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 rounded-full border-2 text-sm font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0',
        value === name
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-transparent bg-accent hover:bg-accent/80'
      )}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span>{name}</span>
    </button>
  )

  const recentMethods = recentNames
    .map((name) => allMethods.find((m) => m.name === name))
    .filter(Boolean) as typeof allMethods

  const otherMethods = allMethods.filter((m) => !recentNames.includes(m.name))

  if (isLoading && paymentMethods.length === 0) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-full bg-accent animate-pulse flex-shrink-0" />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {recentMethods.map((m) => (
          <Chip key={m.name} name={m.name} emoji={m.emoji} />
        ))}
        {otherMethods.map((m) => (
          <Chip key={m.id} name={m.name} emoji={m.emoji} />
        ))}
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full border-2 border-dashed border-border text-sm font-medium text-muted-foreground whitespace-nowrap flex-shrink-0 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all duration-200"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>New Payment Method</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-2xl flex-shrink-0">
                {newEmoji}
              </div>
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') setCreateOpen(false)
                }}
                placeholder="e.g. BPI, Maya, PayPal…"
                className="flex-1 h-12 px-3 rounded-xl bg-background border border-border text-sm outline-none focus:border-primary transition-colors"
                maxLength={30}
              />
            </div>

            <div className="grid grid-cols-8 gap-1">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={emoji}
                  onClick={() => setNewEmoji(emoji)}
                  className={cn(
                    'h-9 rounded-xl text-lg flex items-center justify-center transition-all',
                    newEmoji === emoji
                      ? 'bg-primary/15 ring-2 ring-primary scale-90'
                      : 'bg-accent hover:bg-accent/70'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={isSaving || !newName.trim()}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add Payment Method
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
