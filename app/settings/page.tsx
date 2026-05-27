'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useCategories } from '@/hooks/useCategories'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { Sun, Moon, Monitor, LogOut, User, Palette, Layers, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { user, signOut } = useAuth()
  const { categories, deleteCategory } = useCategories()
  const { paymentMethods, deletePaymentMethod } = usePaymentMethods()
  const { sources, removeSource } = useIncomeSources()

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U'
  const userCategories = categories.filter((c) => !c.is_default)
  const userMethods = paymentMethods.filter((m) => !m.is_default)
  const userSources = sources.filter((s) => !s.is_default)

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Profile</h2>
        </div>
        <Separator />
        <div className="flex items-center gap-4">
          <Avatar className="w-14 h-14">
            <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{user?.email?.split('@')[0] || 'User'}</p>
            <p className="text-sm text-muted-foreground">{user?.email || ''}</p>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Palette className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Appearance</h2>
        </div>
        <Separator />
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200',
                theme === value
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent bg-accent hover:bg-accent/80'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom categories + payment methods */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">My Customizations</h2>
        </div>
        <Separator />

        <div className="space-y-4">
          {/* Categories */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Custom Categories
            </p>
            {userCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">
                None yet — add one from the expense form.
              </p>
            ) : (
              <div className="space-y-1.5">
                {userCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50"
                  >
                    <span className="text-xl leading-none">{cat.icon}</span>
                    <span className="flex-1 text-sm font-medium">{cat.name}</span>
                    <button
                      type="button"
                      onClick={() => deleteCategory(cat.id, cat.name)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`Delete ${cat.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Payment Methods */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Custom Payment Methods
            </p>
            {userMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">
                None yet — add one from the expense form.
              </p>
            ) : (
              <div className="space-y-1.5">
                {userMethods.map((pm) => (
                  <div
                    key={pm.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50"
                  >
                    <span className="text-xl leading-none">{pm.emoji}</span>
                    <span className="flex-1 text-sm font-medium">{pm.name}</span>
                    <button
                      type="button"
                      onClick={() => deletePaymentMethod(pm.id, pm.name)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`Delete ${pm.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Income Sources */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Custom Income Sources
            </p>
            {userSources.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">
                None yet — add one from the Income page.
              </p>
            ) : (
              <div className="space-y-1.5">
                {userSources.map((src) => (
                  <div
                    key={src.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50"
                  >
                    <span className="text-xl leading-none">{src.emoji}</span>
                    <span className="flex-1 text-sm font-medium">{src.name}</span>
                    <button
                      type="button"
                      onClick={() => removeSource(src.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`Delete ${src.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-2xl border border-destructive/20 bg-card p-5 space-y-4">
        <h2 className="font-semibold text-sm text-destructive">Danger Zone</h2>
        <Separator className="border-destructive/20" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-xs text-muted-foreground">Log out from this device</p>
          </div>
          <Button
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-xl"
            onClick={signOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground pb-4">
        Budget Journal v1.0.0 · Built for simplicity
      </p>
    </div>
  )
}
