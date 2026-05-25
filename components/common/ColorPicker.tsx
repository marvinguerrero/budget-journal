'use client'

import { PRESET_COLORS } from '@/lib/constants'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  label?: string
}

export function ColorPicker({ value, onChange, label = 'Color' }: ColorPickerProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="grid grid-cols-6 gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={cn(
              'h-9 w-full rounded-xl flex items-center justify-center transition-all duration-150 hover:scale-110',
              value === color && 'ring-2 ring-offset-2 ring-offset-card ring-foreground/40 scale-110'
            )}
            style={{ backgroundColor: color }}
          >
            {value === color && <Check className="w-4 h-4 text-white drop-shadow" />}
          </button>
        ))}
      </div>
    </div>
  )
}
