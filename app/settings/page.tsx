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
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import {
  Sun, Moon, Monitor, LogOut, User, Palette, Layers, Trash2, Pencil, Wallet, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  ACCOUNT_TYPES, PRESET_COLORS, PRESET_EMOJIS_CATEGORIES,
  PRESET_EMOJIS_INCOME, PRESET_EMOJIS_ACCOUNTS, isLiabilityType,
} from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import type { AccountType, Category, IncomeSource } from '@/types'

const ASSET_TYPES = ACCOUNT_TYPES.filter((t) => t.category === 'asset')
const LIAB_TYPES  = ACCOUNT_TYPES.filter((t) => t.category === 'liability')

const THEMES = [
  { value: 'light',  label: 'Light',  icon: Sun },
  { value: 'dark',   label: 'Dark',   icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

// ── Shared sub-components ────────────────────────────────────

function EmojiPicker({ emojis, value, onChange }: { emojis: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {emojis.map((em) => (
        <button
          key={em} type="button" onClick={() => onChange(em)}
          className={cn(
            'w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-colors',
            value === em ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted hover:bg-accent'
          )}
        >
          {em}
        </button>
      ))}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)}
          aria-label={`Select color ${c}`}
          className={cn('w-7 h-7 rounded-full transition-transform', value === c && 'ring-2 ring-offset-2 ring-primary scale-110')}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { user, signOut } = useAuth()
  const { categories, deleteCategory, updateCategory } = useCategories()
  const { sources, removeSource, editSource } = useIncomeSources()
  const { accounts, addAccount, editAccount, removeAccount } = useFinancialAccounts()

  // ── Category edit state ──────────────────────────────────────
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editCatName,  setEditCatName]  = useState('')
  const [editCatIcon,  setEditCatIcon]  = useState('📦')
  const [editCatColor, setEditCatColor] = useState('#6B7280')
  const [isSavingCat, setIsSavingCat]   = useState(false)

  const openEditCat = (cat: Category) => {
    setEditingCat(cat)
    setEditCatName(cat.name)
    setEditCatIcon(cat.icon)
    setEditCatColor(cat.color)
  }

  const handleUpdateCat = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingCat) return
    setIsSavingCat(true)
    try {
      await updateCategory(editingCat.id, { name: editCatName.trim(), icon: editCatIcon, color: editCatColor })
      setEditingCat(null)
    } finally {
      setIsSavingCat(false)
    }
  }

  // ── Income source edit state ─────────────────────────────────
  const [editingSrc, setEditingSrc] = useState<IncomeSource | null>(null)
  const [editSrcName,  setEditSrcName]  = useState('')
  const [editSrcEmoji, setEditSrcEmoji] = useState('💰')
  const [editSrcColor, setEditSrcColor] = useState('#10B981')
  const [isSavingSrc, setIsSavingSrc]   = useState(false)

  const openEditSrc = (src: IncomeSource) => {
    setEditingSrc(src)
    setEditSrcName(src.name)
    setEditSrcEmoji(src.emoji)
    setEditSrcColor(src.color)
  }

  const handleUpdateSrc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingSrc) return
    setIsSavingSrc(true)
    try {
      await editSource(editingSrc.id, { name: editSrcName.trim(), emoji: editSrcEmoji, color: editSrcColor })
      setEditingSrc(null)
    } finally {
      setIsSavingSrc(false)
    }
  }

  // ── Account create state ─────────────────────────────────────
  const [showCreateAcc, setShowCreateAcc] = useState(false)
  const [accName,    setAccName]    = useState('')
  const [accEmoji,   setAccEmoji]   = useState('🏦')
  const [accType,    setAccType]    = useState<AccountType>('bank')
  const [accBalance, setAccBalance] = useState('0')
  const [accColor,   setAccColor]   = useState('#3B82F6')

  // ── Account edit state ───────────────────────────────────────
  const [editingAcc,     setEditingAcc]     = useState<string | null>(null)
  const [editAccName,    setEditAccName]    = useState('')
  const [editAccEmoji,   setEditAccEmoji]   = useState('🏦')
  const [editAccType,    setEditAccType]    = useState<AccountType>('bank')
  const [editAccBalance, setEditAccBalance] = useState('0')
  const [editAccColor,   setEditAccColor]   = useState('#3B82F6')
  const [isSavingAcc,    setIsSavingAcc]    = useState(false)

  // ── Account delete confirm ───────────────────────────────────
  const [deleteAccId, setDeleteAccId] = useState<string | null>(null)
  const deleteAccTarget = accounts.find((a) => a.id === deleteAccId)

  const openEditAcc = (id: string) => {
    const acc = accounts.find((a) => a.id === id)
    if (!acc) return
    setEditingAcc(id)
    setEditAccName(acc.name)
    setEditAccEmoji(acc.emoji)
    setEditAccType(acc.type)
    setEditAccBalance(String(Math.abs(acc.balance)))
    setEditAccColor(acc.color ?? '#3B82F6')
  }

  const handleCreateAcc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSavingAcc(true)
    const rawBalance = parseFloat(accBalance) || 0
    const balance = isLiabilityType(accType) ? -(Math.abs(rawBalance)) : rawBalance
    try {
      await addAccount({ name: accName.trim(), emoji: accEmoji, color: accColor, type: accType, balance })
      setShowCreateAcc(false)
      setAccName(''); setAccEmoji('🏦'); setAccType('bank'); setAccBalance('0'); setAccColor('#3B82F6')
    } finally {
      setIsSavingAcc(false)
    }
  }

  const handleUpdateAcc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingAcc) return
    setIsSavingAcc(true)
    const rawBalance = parseFloat(editAccBalance) || 0
    const balance = isLiabilityType(editAccType) ? -(Math.abs(rawBalance)) : rawBalance
    try {
      await editAccount(editingAcc, { name: editAccName.trim(), emoji: editAccEmoji, type: editAccType, balance, color: editAccColor })
      setEditingAcc(null)
    } finally {
      setIsSavingAcc(false)
    }
  }

  const confirmDeleteAcc = async () => {
    if (!deleteAccId) return
    await removeAccount(deleteAccId)
    setDeleteAccId(null)
  }

  // ── Derived ──────────────────────────────────────────────────
  const initials       = user?.email?.slice(0, 2).toUpperCase() || 'U'
  const userCategories = categories.filter((c) => !c.is_default)
  const userSources    = sources.filter((s) => !s.is_default)

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
              key={value} type="button" onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200',
                theme === value ? 'border-primary bg-primary/5' : 'border-transparent bg-accent hover:bg-accent/80'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Categories</h2>
        </div>
        <Separator />
        {userCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">None yet — add one from the expense form.</p>
        ) : (
          <div className="space-y-1.5">
            {userCategories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                  style={{ backgroundColor: cat.color + '20' }}
                >
                  {cat.icon}
                </span>
                <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0 border border-border/50"
                  style={{ backgroundColor: cat.color }}
                />
                <button
                  type="button" onClick={() => openEditCat(cat)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label={`Edit ${cat.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button" onClick={() => deleteCategory(cat.id, cat.name)}
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

      {/* Income Sources */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Income Sources</h2>
        </div>
        <Separator />
        {userSources.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">None yet — add one from the Income page.</p>
        ) : (
          <div className="space-y-1.5">
            {userSources.map((src) => (
              <div key={src.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                  style={{ backgroundColor: src.color + '20' }}
                >
                  {src.emoji}
                </span>
                <span className="flex-1 text-sm font-medium truncate">{src.name}</span>
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0 border border-border/50"
                  style={{ backgroundColor: src.color }}
                />
                <button
                  type="button" onClick={() => openEditSrc(src)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label={`Edit ${src.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button" onClick={() => removeSource(src.id)}
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

      {/* Financial Accounts */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Financial Accounts</h2>
          </div>
          <Button type="button" size="sm" className="h-8 rounded-xl text-xs gap-1.5" onClick={() => setShowCreateAcc(true)}>
            + Add Account
          </Button>
        </div>
        <Separator />
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">No accounts yet — add one to start tracking balances.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map((acc) => {
              const typeInfo = ACCOUNT_TYPES.find((t) => t.value === acc.type)
              const isLiab   = isLiabilityType(acc.type)
              return (
                <div key={acc.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                    style={{ backgroundColor: (acc.color ?? '#3B82F6') + '20' }}
                  >
                    {acc.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{acc.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {typeInfo?.label ?? acc.type}
                      {isLiab && <span className="ml-1 text-amber-500">· Liability</span>}
                    </p>
                  </div>
                  <span className={cn(
                    'text-sm font-bold tabular-nums',
                    isLiab
                      ? acc.balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      : acc.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  )}>
                    {isLiab
                      ? acc.balance < 0 ? `${formatCurrency(Math.abs(acc.balance))} owed` : 'No debt'
                      : formatCurrency(acc.balance)
                    }
                  </span>
                  <button
                    type="button" onClick={() => openEditAcc(acc.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
                    aria-label={`Edit ${acc.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button" onClick={() => setDeleteAccId(acc.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
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

      {/* ── Edit Category dialog ─────────────────────────────── */}
      <Dialog open={!!editingCat} onOpenChange={(open) => { if (!open) setEditingCat(null) }}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Category</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateCat} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Icon</Label>
              <EmojiPicker emojis={PRESET_EMOJIS_CATEGORIES} value={editCatIcon} onChange={setEditCatIcon} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Name</Label>
              <Input
                placeholder="e.g. Groceries"
                value={editCatName} onChange={(e) => setEditCatName(e.target.value)}
                className="h-11 rounded-xl" required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Color</Label>
              <ColorPicker value={editCatColor} onChange={setEditCatColor} />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setEditingCat(null)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingCat || !editCatName.trim()}>
                {isSavingCat ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Income Source dialog ────────────────────────── */}
      <Dialog open={!!editingSrc} onOpenChange={(open) => { if (!open) setEditingSrc(null) }}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Income Source</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateSrc} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Icon</Label>
              <EmojiPicker emojis={PRESET_EMOJIS_INCOME} value={editSrcEmoji} onChange={setEditSrcEmoji} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Name</Label>
              <Input
                placeholder="e.g. Freelance"
                value={editSrcName} onChange={(e) => setEditSrcName(e.target.value)}
                className="h-11 rounded-xl" required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Color</Label>
              <ColorPicker value={editSrcColor} onChange={setEditSrcColor} />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setEditingSrc(null)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingSrc || !editSrcName.trim()}>
                {isSavingSrc ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Create Account dialog ────────────────────────────── */}
      <Dialog open={showCreateAcc} onOpenChange={setShowCreateAcc}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">New Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAcc} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Icon</Label>
              <EmojiPicker emojis={PRESET_EMOJIS_ACCOUNTS} value={accEmoji} onChange={setAccEmoji} />
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
                  <SelectItem value="__asset_header__" disabled className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assets</SelectItem>
                  {ASSET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                  <SelectItem value="__liab_header__" disabled className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Liabilities</SelectItem>
                  {LIAB_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Color</Label>
              <ColorPicker value={accColor} onChange={setAccColor} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {isLiabilityType(accType) ? 'Current Debt (₱)' : 'Current Balance (₱)'}
              </Label>
              {isLiabilityType(accType) && (
                <p className="text-[10px] text-muted-foreground">Enter amount currently owed (positive number)</p>
              )}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  placeholder="0.00" value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                  className="pl-7 h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setShowCreateAcc(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingAcc || !accName.trim()}>
                {isSavingAcc ? 'Saving…' : 'Add Account'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Account dialog ──────────────────────────────── */}
      <Dialog open={!!editingAcc} onOpenChange={(open) => { if (!open) setEditingAcc(null) }}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateAcc} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Icon</Label>
              <EmojiPicker emojis={PRESET_EMOJIS_ACCOUNTS} value={editAccEmoji} onChange={setEditAccEmoji} />
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
                  <SelectItem value="__asset_header__" disabled className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assets</SelectItem>
                  {ASSET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                  <SelectItem value="__liab_header__" disabled className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Liabilities</SelectItem>
                  {LIAB_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Color</Label>
              <ColorPicker value={editAccColor} onChange={setEditAccColor} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {isLiabilityType(editAccType) ? 'Current Debt (₱)' : 'Current Balance (₱)'}
              </Label>
              {isLiabilityType(editAccType) && (
                <p className="text-[10px] text-muted-foreground">Enter amount currently owed (positive number)</p>
              )}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  placeholder="0.00" value={editAccBalance}
                  onChange={(e) => setEditAccBalance(e.target.value)}
                  className="pl-7 h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setEditingAcc(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingAcc || !editAccName.trim()}>
                {isSavingAcc ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account confirmation ──────────────────────── */}
      <Dialog open={!!deleteAccId} onOpenChange={(open) => { if (!open) setDeleteAccId(null) }}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Delete Account?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Deleting <span className="font-semibold">{deleteAccTarget?.emoji} {deleteAccTarget?.name}</span> will
                remove the account. Past transactions linked to it will remain in history but balance tracking
                for this account will stop.
              </p>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setDeleteAccId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 h-11 rounded-xl font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={confirmDeleteAcc}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
