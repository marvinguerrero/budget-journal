'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCategories } from '@/hooks/useCategories'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { Sun, Moon, Monitor, LogOut, User, Palette, Layers, Trash2, Pencil, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { ACCOUNT_TYPES, PRESET_EMOJIS_ACCOUNTS } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import type { AccountType } from '@/types'

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

  const { accounts, addAccount, editAccount, removeAccount } = useFinancialAccounts()

  // ── Account create state ───────────────────────────────────
  const [showCreateAcc, setShowCreateAcc] = useState(false)
  const [accName,    setAccName]    = useState('')
  const [accEmoji,   setAccEmoji]   = useState('🏦')
  const [accType,    setAccType]    = useState<AccountType>('bank')
  const [accBalance, setAccBalance] = useState('0')

  // ── Account edit state ─────────────────────────────────────
  const [editingAcc, setEditingAcc]   = useState<string | null>(null)
  const [editAccName,    setEditAccName]    = useState('')
  const [editAccEmoji,   setEditAccEmoji]   = useState('🏦')
  const [editAccType,    setEditAccType]    = useState<AccountType>('bank')
  const [editAccBalance, setEditAccBalance] = useState('0')
  const [isSavingAcc, setIsSavingAcc] = useState(false)

  const openEditAcc = (id: string) => {
    const acc = accounts.find((a) => a.id === id)
    if (!acc) return
    setEditingAcc(id)
    setEditAccName(acc.name)
    setEditAccEmoji(acc.emoji)
    setEditAccType(acc.type)
    setEditAccBalance(String(acc.balance))
  }

  const handleCreateAcc = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingAcc(true)
    try {
      await addAccount({
        name: accName.trim(),
        emoji: accEmoji,
        color: '#3B82F6',
        type: accType,
        balance: parseFloat(accBalance) || 0,
      })
      setShowCreateAcc(false)
      setAccName('')
      setAccEmoji('🏦')
      setAccType('bank')
      setAccBalance('0')
    } finally {
      setIsSavingAcc(false)
    }
  }

  const handleUpdateAcc = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAcc) return
    setIsSavingAcc(true)
    try {
      await editAccount(editingAcc, {
        name: editAccName.trim(),
        emoji: editAccEmoji,
        type: editAccType,
        balance: parseFloat(editAccBalance) || 0,
      })
      setEditingAcc(null)
    } finally {
      setIsSavingAcc(false)
    }
  }

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

      {/* Financial Accounts */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Financial Accounts</h2>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-xl text-xs gap-1.5"
            onClick={() => setShowCreateAcc(true)}
          >
            + Add Account
          </Button>
        </div>
        <Separator />

        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">
            No accounts yet — add one to start tracking balances.
          </p>
        ) : (
          <div className="space-y-2">
            {accounts.map((acc) => {
              const typeInfo = ACCOUNT_TYPES.find((t) => t.value === acc.type)
              return (
                <div
                  key={acc.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50"
                >
                  <span className="text-xl leading-none">{acc.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{acc.name}</p>
                    <p className="text-[10px] text-muted-foreground">{typeInfo?.label ?? acc.type}</p>
                  </div>
                  <span className={cn(
                    'text-sm font-bold tabular-nums mr-1',
                    acc.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  )}>
                    {formatCurrency(acc.balance)}
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditAcc(acc.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    aria-label={`Edit ${acc.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAccount(acc.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={`Delete ${acc.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Account dialog */}
      <Dialog open={showCreateAcc} onOpenChange={setShowCreateAcc}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">New Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAcc} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_EMOJIS_ACCOUNTS.map((em) => (
                  <button
                    key={em} type="button" onClick={() => setAccEmoji(em)}
                    className={cn(
                      'w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-colors',
                      accEmoji === em ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted hover:bg-accent'
                    )}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Name</Label>
              <Input
                placeholder="e.g. BPI Savings"
                value={accName} onChange={(e) => setAccName(e.target.value)}
                className="h-11 rounded-xl" required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Type</Label>
              <Select value={accType} onValueChange={(v: string | null) => v && setAccType(v as AccountType)}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Current Balance (₱)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input
                  type="number" inputMode="decimal" step="0.01"
                  placeholder="0.00" value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                  className="pl-7 h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
                onClick={() => setShowCreateAcc(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold"
                disabled={isSavingAcc || !accName.trim()}>
                {isSavingAcc ? 'Saving…' : 'Add Account'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Account dialog */}
      <Dialog open={!!editingAcc} onOpenChange={(open) => { if (!open) setEditingAcc(null) }}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateAcc} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_EMOJIS_ACCOUNTS.map((em) => (
                  <button
                    key={em} type="button" onClick={() => setEditAccEmoji(em)}
                    className={cn(
                      'w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-colors',
                      editAccEmoji === em ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted hover:bg-accent'
                    )}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Name</Label>
              <Input
                placeholder="e.g. BPI Savings"
                value={editAccName} onChange={(e) => setEditAccName(e.target.value)}
                className="h-11 rounded-xl" required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Type</Label>
              <Select value={editAccType} onValueChange={(v: string | null) => v && setEditAccType(v as AccountType)}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Balance (₱)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input
                  type="number" inputMode="decimal" step="0.01"
                  placeholder="0.00" value={editAccBalance}
                  onChange={(e) => setEditAccBalance(e.target.value)}
                  className="pl-7 h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
                onClick={() => setEditingAcc(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold"
                disabled={isSavingAcc || !editAccName.trim()}>
                {isSavingAcc ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
