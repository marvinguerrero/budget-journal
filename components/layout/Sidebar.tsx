'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Receipt,
  TrendingUp,
  Wallet,
  Users,
  Gift,
  Target,
  BarChart3,
  PieChart,
  Settings,
  Scale,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  activePaths?: string[]
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Activity',
    items: [
      {
        href: '/expenses',
        label: 'Expenses',
        icon: Receipt,
        activePaths: ['/expenses', '/income', '/activity'],
      },
      { href: '/income',            label: 'Income',   icon: TrendingUp },
      { href: '/activity/accounts', label: 'Accounts', icon: Wallet     },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        href: '/budgets',
        label: 'Budgets',
        icon: Target,
      },
      { href: '/wishlist', label: 'Wishlist', icon: Gift },
      { href: '/analytics', label: 'Analytics', icon: PieChart },
    ],
  },
  {
    label: 'Shared',
    items: [
      { href: '/shared',   label: 'Shared Budgets', icon: Users  },
      { href: '/balances', label: 'Balances',        icon: Scale  },
    ],
  },
  {
    label: '',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function NavLink({ href, label, icon: Icon, activePaths }: NavItem) {
  const pathname = usePathname()
  const paths = activePaths ?? [href]
  const isActive = paths.some((p) => pathname === p || pathname.startsWith(p + '/'))

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
    >
      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      {label}
    </Link>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-card border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
          <ArrowLeftRight className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-bold text-sm">Budget Journal</p>
          <p className="text-xs text-muted-foreground">Personal Finance</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {group.label && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">Budget Journal v1.0</p>
      </div>
    </aside>
  )
}
