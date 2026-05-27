'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Target, PieChart } from 'lucide-react'

const tabs = [
  { href: '/budgets',   label: 'Budgets',   icon: Target   },
  { href: '/analytics', label: 'Analytics', icon: PieChart },
]

export function InsightsTabs() {
  const pathname = usePathname()
  return (
    <div className="sticky top-0 z-10 flex bg-background border-b border-border px-2">
      {tabs.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Link>
        )
      })}
    </div>
  )
}
