'use client'

import Link from 'next/link'
import { SharedGroup } from '@/types'
import { Users, ChevronRight } from 'lucide-react'

interface Props {
  group: SharedGroup
}

export function SharedGroupCard({ group }: Props) {
  return (
    <Link
      href={`/shared/${group.id}`}
      className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:bg-accent/50 transition-colors"
    >
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl flex-shrink-0">
        {group.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{group.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Users className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Shared group</span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </Link>
  )
}
