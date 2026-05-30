'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ArrowLeftRight, BarChart3, Users, Scale, Settings,
} from 'lucide-react'

const navItems = [
  {
    href:        '/dashboard',
    label:       'Home',
    icon:        LayoutDashboard,
    activePaths: ['/dashboard'],
  },
  {
    href:        '/expenses',
    label:       'Activity',
    icon:        ArrowLeftRight,
    activePaths: ['/expenses', '/income', '/activity'],
  },
  {
    href:        '/budgets',
    label:       'Insights',
    icon:        BarChart3,
    activePaths: ['/budgets', '/analytics', '/insights'],
  },
  {
    href:        '/shared',
    label:       'Shared',
    icon:        Users,
    activePaths: ['/shared'],
  },
  {
    href:        '/balances',
    label:       'Balances',
    icon:        Scale,
    activePaths: ['/balances'],
  },
  {
    href:        '/settings',
    label:       'Settings',
    icon:        Settings,
    activePaths: ['/settings'],
  },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border">
      <div className="flex items-center pb-safe">
        {navItems.map(({ href, label, icon: Icon, activePaths }) => {
          const isActive = activePaths.some(
            (p) => pathname === p || pathname.startsWith(p + '/')
          )
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 flex-1 transition-all duration-200',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn(
                'p-1.5 rounded-xl transition-all duration-200',
                isActive && 'bg-primary/10'
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={cn(
                'text-[10px] font-medium leading-none',
                isActive && 'font-semibold'
              )}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
