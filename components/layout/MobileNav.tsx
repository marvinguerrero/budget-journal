'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Receipt, Target, Users, PieChart, Settings, TrendingUp,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Home',     icon: LayoutDashboard },
  { href: '/expenses',  label: 'Expenses', icon: Receipt },
  { href: '/income',    label: 'Income',   icon: TrendingUp },
  { href: '/budgets',   label: 'Budget',   icon: Target },
  { href: '/shared',    label: 'Shared',   icon: Users },
  { href: '/analytics', label: 'Analytics',icon: PieChart },
  { href: '/settings',  label: 'Settings', icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border">
      <div className="flex items-center justify-around px-1 py-2 pb-safe">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all duration-200 flex-1',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn('p-1.5 rounded-lg transition-all duration-200', isActive && 'bg-primary/10')}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
