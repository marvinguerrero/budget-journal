'use client'

import { useMemo, useState, useRef } from 'react'
import { useCategories } from '@/hooks/useCategories'
import { useExpenseStore } from '@/store/useExpenseStore'
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Plus, X, Loader2 } from 'lucide-react'

const QUICK_EMOJIS = [
  '☕','🍕','🍔','🥗','🍣','🎮','💪','🐶',
  '🎬','🚗','🏠','💡','🛍️','💊','🏦','🎁',
  '📚','✈️','⛽','🧴','🌿','🐱','🎵','🏊',
  '🍜','🍰','🥤','🎲','🛵','📦','💰','🎒',
]

interface CategorySelectorProps {
  value: string
  onChange: (value: string) => void
}

export function CategorySelector({ value, onChange }: CategorySelectorProps) {
  const { categories, isLoading, createCategory } = useCategories()
  const expenses = useExpenseStore((s) => s.expenses)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('🏷️')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const recentNames = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const e of expenses) {
      if (!seen.has(e.category)) {
        seen.add(e.category)
        result.push(e.category)
      }
      if (result.length === 3) break
    }
    return result
  }, [expenses])

  const allCategories =
    categories.length > 0
      ? categories
      : DEFAULT_CATEGORIES.map((c, i) => ({
          ...c,
          id: `default-${i}`,
          user_id: null,
          is_default: true,
          created_at: '',
        }))

  const recentCategories = recentNames
    .map((name) => allCategories.find((c) => c.name === name))
    .filter(Boolean) as typeof allCategories

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setIsSaving(true)
    try {
      const cat = await createCategory({ name, icon: newEmoji, color: '#6B7280' })
      onChange(cat.name)
      setIsCreating(false)
      setNewName('')
      setNewEmoji('🏷️')
    } finally {
      setIsSaving(false)
    }
  }

  const openCreate = () => {
    setIsCreating(true)
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  const cancelCreate = () => {
    setIsCreating(false)
    setNewName('')
    setNewEmoji('🏷️')
  }

  const CategoryButton = ({
    cat,
    small = false,
  }: {
    cat: (typeof allCategories)[0]
    small?: boolean
  }) => (
    <button
      type="button"
      onClick={() => onChange(cat.name)}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border-2 transition-all duration-200',
        small ? 'p-2' : 'p-2.5',
        value === cat.name
          ? 'border-primary bg-primary/5 scale-95'
          : 'border-transparent bg-accent hover:bg-accent/80 hover:scale-95'
      )}
    >
      <span className={cn('leading-none', small ? 'text-xl' : 'text-2xl')}>{cat.icon}</span>
      <span className="text-[10px] font-medium text-center leading-tight truncate w-full px-0.5">
        {cat.name}
      </span>
    </button>
  )

  return (
    <div className="space-y-3">
      {recentCategories.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Recent
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {recentCategories.map((cat) => (
              <CategoryButton key={cat.name} cat={cat} small />
            ))}
          </div>
        </div>
      )}

      <div>
        {recentCategories.length > 0 && (
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            All
          </p>
        )}
        <div className="grid grid-cols-4 gap-2">
          {isLoading && categories.length === 0
            ? DEFAULT_CATEGORIES.map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-accent animate-pulse" />
              ))
            : allCategories.map((cat) => (
                <CategoryButton key={cat.id} cat={cat} />
              ))}
        </div>
      </div>

      {isCreating ? (
        <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center text-xl flex-shrink-0">
              {newEmoji}
            </div>
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') cancelCreate()
              }}
              placeholder="Category name…"
              className="flex-1 h-10 px-3 rounded-xl bg-background border border-border text-sm outline-none focus:border-primary transition-colors min-w-0"
              maxLength={30}
            />
            <button
              type="button"
              onClick={cancelCreate}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-8 gap-1">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={emoji}
                onClick={() => setNewEmoji(emoji)}
                className={cn(
                  'h-8 rounded-lg text-lg flex items-center justify-center transition-all',
                  newEmoji === emoji
                    ? 'bg-primary/15 ring-2 ring-primary scale-90'
                    : 'hover:bg-accent'
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
            className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-opacity"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Category
              </>
            )}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCreate}
          className="w-full h-9 rounded-xl border-2 border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all duration-200 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          New category
        </button>
      )}
    </div>
  )
}
