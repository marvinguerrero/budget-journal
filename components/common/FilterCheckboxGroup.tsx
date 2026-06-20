'use client'

import { cn } from '@/lib/utils'

interface FilterCheckboxGroupProps {
  title: string
  options: ReadonlyArray<{ value: string; label: string }>
  selected: string[]
  onToggle: (value: string) => void
}

/**
 * One multi-select checkbox group used inside a deferred-apply filter
 * panel. Shared between Expenses and Income (and any future list page)
 * so the filtering UX is guaranteed identical by construction, not by
 * two hand-copied implementations that could drift apart.
 */
export function FilterCheckboxGroup({ title, options, selected, onToggle }: FilterCheckboxGroupProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1.5">
        {options.map((opt) => {
          const checked = selected.includes(opt.value)
          return (
            <label
              key={opt.value}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors',
                checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(opt.value)}
                className="h-4 w-4 rounded accent-primary"
              />
              {opt.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}
