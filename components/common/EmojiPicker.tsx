'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
  presets: string[]
  label?: string
}

export function EmojiPicker({ value, onChange, presets, label = 'Emoji' }: EmojiPickerProps) {
  const [search, setSearch] = useState('')

  const filtered = search
    ? presets // no real emoji search — just show all on any input
    : presets

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="flex gap-2 items-center">
        <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-2xl flex-shrink-0 border border-border">
          {value || '?'}
        </div>
        <Input
          value={search || value}
          onChange={(e) => {
            const v = e.target.value
            setSearch(v)
            // If user typed/pasted a single emoji, accept it immediately
            const trimmed = v.trim()
            if ([...trimmed].length === 1 || (trimmed.length <= 3 && /\p{Emoji}/u.test(trimmed))) {
              onChange(trimmed)
            }
          }}
          placeholder="Type or paste emoji…"
          className="h-10 rounded-xl flex-1 text-lg"
          maxLength={8}
        />
      </div>
      <div className="grid grid-cols-8 gap-1.5 max-h-36 overflow-y-auto">
        {filtered.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => { onChange(emoji); setSearch('') }}
            className={cn(
              'h-9 w-full rounded-lg text-xl flex items-center justify-center transition-all',
              value === emoji
                ? 'bg-primary/15 ring-2 ring-primary scale-95'
                : 'hover:bg-accent hover:scale-95'
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
