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
import { useFinancialAccountTypes } from '@/hooks/useFinancialAccountTypes'
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
import type { AccountCategory, AccountType, Category, FinancialAccountType, IncomeSource } from '@/types'

const THEMES = [
  { value: 'light',  label: 'Light',  icon: Sun },
  { value: 'dark',   label: 'Dark',   icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const isCreditCardType = (type: string) => type === 'credit'

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function dateForDay(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)))
}

function formatDateLabel(value: Date | string | null | undefined) {
  if (!value) return 'Not set'
  const date = typeof value === 'string' ? new Date(value + (value.length === 10 ? 'T00:00:00' : '')) : value
  return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

function addMonthsClamped(date: Date, months: number) {
  return dateForDay(date.getFullYear(), date.getMonth() + months, date.getDate())
}

function getCreditCardPreview(soaDay: string, dueDay: string, lastStatementDate: string) {
  const soa = Number(soaDay)
  const due = Number(dueDay)
  if (!soa || !due) return null

  const today = new Date()
  const lastStatement = lastStatementDate ? new Date(lastStatementDate + 'T00:00:00') : null
  let nextStatement: Date

  if (lastStatement) {
    nextStatement = dateForDay(lastStatement.getFullYear(), lastStatement.getMonth() + 1, soa)
    while (nextStatement < today) nextStatement = addMonthsClamped(nextStatement, 1)
  } else {
    const candidate = dateForDay(today.getFullYear(), today.getMonth(), soa)
    nextStatement = today <= candidate
      ? candidate
      : dateForDay(today.getFullYear(), today.getMonth() + 1, soa)
  }

  const previousStatement = dateForDay(nextStatement.getFullYear(), nextStatement.getMonth() - 1, soa)
  const cycleStart = new Date(previousStatement)
  cycleStart.setDate(cycleStart.getDate() + 1)
  const dueMonthOffset = due > soa ? 0 : 1
  const dueDate = dateForDay(nextStatement.getFullYear(), nextStatement.getMonth() + dueMonthOffset, due)

  return { cycleStart, cycleEnd: nextStatement, nextStatement, dueDate }
}

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
  const { accountTypes, addAccountType, editAccountType, removeAccountType } = useFinancialAccountTypes()

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
  const [accCreditLimit, setAccCreditLimit] = useState('')
  const [accSoaDay, setAccSoaDay] = useState('')
  const [accDueDay, setAccDueDay] = useState('')
  const [accLastStatementDate, setAccLastStatementDate] = useState('')

  // ── Account edit state ───────────────────────────────────────
  const [editingAcc,     setEditingAcc]     = useState<string | null>(null)
  const [editAccName,    setEditAccName]    = useState('')
  const [editAccEmoji,   setEditAccEmoji]   = useState('🏦')
  const [editAccType,    setEditAccType]    = useState<AccountType>('bank')
  const [editAccBalance, setEditAccBalance] = useState('0')
  const [editAccColor,   setEditAccColor]   = useState('#3B82F6')
  const [editAccCreditLimit, setEditAccCreditLimit] = useState('')
  const [editAccSoaDay, setEditAccSoaDay] = useState('')
  const [editAccDueDay, setEditAccDueDay] = useState('')
  const [editAccLastStatementDate, setEditAccLastStatementDate] = useState('')
  const [isSavingAcc,    setIsSavingAcc]    = useState(false)

  // ── Account type management state ────────────────────────────
  const [typeName, setTypeName] = useState('')
  const [typeCategory, setTypeCategory] = useState<AccountCategory>('asset')
  const [editingType, setEditingType] = useState<FinancialAccountType | null>(null)
  const [editTypeName, setEditTypeName] = useState('')
  const [editTypeCategory, setEditTypeCategory] = useState<AccountCategory>('asset')
  const [isSavingType, setIsSavingType] = useState(false)

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
    setEditAccCreditLimit(acc.credit_limit?.toString() ?? '')
    setEditAccSoaDay(acc.soa_day?.toString() ?? '')
    setEditAccDueDay(acc.due_day?.toString() ?? '')
    setEditAccLastStatementDate(acc.last_statement_date?.slice(0, 10) ?? '')
  }

  const handleCreateAcc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSavingAcc(true)
    const rawBalance = parseFloat(accBalance) || 0
    const category = accountTypeCategory(accType)
    const isCreditCard = isCreditCardType(accType)
    const balance = category === 'liability' ? -(Math.abs(rawBalance)) : rawBalance
    try {
      await addAccount({
        name: accName.trim(),
        emoji: accEmoji,
        color: accColor,
        type: accType,
        category,
        balance,
        credit_limit: isCreditCard ? Number(accCreditLimit) : null,
        soa_day: isCreditCard ? Number(accSoaDay) : null,
        due_day: isCreditCard ? Number(accDueDay) : null,
        last_statement_date: isCreditCard && accLastStatementDate ? accLastStatementDate : null,
      })
      setShowCreateAcc(false)
      setAccName(''); setAccEmoji('🏦'); setAccType('bank'); setAccBalance('0'); setAccColor('#3B82F6')
      setAccCreditLimit(''); setAccSoaDay(''); setAccDueDay(''); setAccLastStatementDate('')
    } finally {
      setIsSavingAcc(false)
    }
  }

  const handleUpdateAcc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingAcc) return
    setIsSavingAcc(true)
    const rawBalance = parseFloat(editAccBalance) || 0
    const category = accountTypeCategory(editAccType)
    const isCreditCard = isCreditCardType(editAccType)
    const balance = category === 'liability' ? -(Math.abs(rawBalance)) : rawBalance
    try {
      await editAccount(editingAcc, {
        name: editAccName.trim(),
        emoji: editAccEmoji,
        type: editAccType,
        category,
        balance,
        color: editAccColor,
        credit_limit: isCreditCard ? Number(editAccCreditLimit) : null,
        soa_day: isCreditCard ? Number(editAccSoaDay) : null,
        due_day: isCreditCard ? Number(editAccDueDay) : null,
        last_statement_date: isCreditCard && editAccLastStatementDate ? editAccLastStatementDate : null,
      })
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
  const customAccountTypes = accountTypes.filter((t) => !t.is_default)
  const accountTypeOptions = [
    ...ACCOUNT_TYPES.map((t) => ({
      id: t.value,
      value: t.value,
      label: t.label,
      emoji: t.emoji,
      category: t.category as AccountCategory,
    })),
    ...customAccountTypes.map((t) => ({
      id: t.id,
      value: t.name,
      label: t.name,
      emoji: '🏷️',
      category: t.category,
    })),
  ]
  const assetTypeOptions = accountTypeOptions.filter((t) => t.category === 'asset')
  const liabilityTypeOptions = accountTypeOptions.filter((t) => t.category === 'liability')
  const accountTypeCategory = (type: string): AccountCategory => {
    const custom = customAccountTypes.find((t) => t.name === type)
    if (custom) return custom.category
    return isLiabilityType(type) ? 'liability' : 'asset'
  }
  const accountTypeLabel = (type: string) =>
    ACCOUNT_TYPES.find((t) => t.value === type)?.label
    ?? customAccountTypes.find((t) => t.name === type)?.name
    ?? type
  const isCreatingCreditCard = isCreditCardType(accType)
  const isEditingCreditCard = isCreditCardType(editAccType)
  const createCreditLimit = Number(accCreditLimit)
  const editCreditLimit = Number(editAccCreditLimit)
  const createOutstanding = parseFloat(accBalance) || 0
  const editOutstanding = parseFloat(editAccBalance) || 0
  const canSaveCreateAccount = Boolean(accName.trim())
    && (!isCreatingCreditCard
      || (createCreditLimit > 0
        && Number(accSoaDay) >= 1
        && Number(accSoaDay) <= 31
        && Number(accDueDay) >= 1
        && Number(accDueDay) <= 31
        && createOutstanding <= createCreditLimit))
  const canSaveEditAccount = Boolean(editAccName.trim())
    && (!isEditingCreditCard
      || (editCreditLimit > 0
        && Number(editAccSoaDay) >= 1
        && Number(editAccSoaDay) <= 31
        && Number(editAccDueDay) >= 1
        && Number(editAccDueDay) <= 31
        && editOutstanding <= editCreditLimit))
  const createCreditPreview = isCreatingCreditCard
    ? getCreditCardPreview(accSoaDay, accDueDay, accLastStatementDate)
    : null
  const editCreditPreview = isEditingCreditCard
    ? getCreditCardPreview(editAccSoaDay, editAccDueDay, editAccLastStatementDate)
    : null

  const handleCreateType = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSavingType(true)
    try {
      const created = await addAccountType({ name: typeName.trim(), category: typeCategory })
      if (created) {
        setTypeName('')
        setTypeCategory('asset')
      }
    } finally {
      setIsSavingType(false)
    }
  }

  const openEditType = (type: FinancialAccountType) => {
    setEditingType(type)
    setEditTypeName(type.name)
    setEditTypeCategory(type.category)
  }

  const handleUpdateType = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingType) return
    setIsSavingType(true)
    try {
      const updated = await editAccountType(editingType.id, { name: editTypeName.trim(), category: editTypeCategory })
      if (updated) {
        setEditingType(null)
      }
    } finally {
      setIsSavingType(false)
    }
  }

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

      {/* Financial Account Types */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Financial Account Types</h2>
        </div>
        <Separator />
        <form onSubmit={handleCreateType} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Type Name</Label>
            <Input
              placeholder="e.g. Crypto Wallet"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              className="h-10 rounded-xl"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Category</Label>
            <Select value={typeCategory} onValueChange={(v: AccountCategory | null) => v && setTypeCategory(v)}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">Asset</SelectItem>
                <SelectItem value="liability">Liability</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="h-10 rounded-xl self-end" disabled={isSavingType || !typeName.trim()}>
            {isSavingType ? 'Saving…' : 'Add Type'}
          </Button>
        </form>
        <div className="space-y-1.5">
          {accountTypes.map((type) => (
            <div key={type.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0 bg-muted">
                {type.category === 'asset' ? '💼' : '💳'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{type.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {type.category === 'asset' ? 'Asset' : 'Liability'}
                  {type.is_default && <span className="ml-1">· Default</span>}
                </p>
              </div>
              {!type.is_default && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditType(type)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    aria-label={`Edit ${type.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAccountType(type.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={`Delete ${type.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
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
              const isLiab = acc.category === 'liability'
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
                      {accountTypeLabel(acc.type)}
                      {isLiab && <span className="ml-1 text-amber-500">· Liability</span>}
                    </p>
                    {isCreditCardType(acc.type) && (
                      <p className="text-[10px] text-muted-foreground">
                        Limit {formatCurrency(acc.credit_limit ?? 0)} · SOA {acc.soa_day ?? '-'} · Due {acc.due_day ?? '-'}
                      </p>
                    )}
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
                  {assetTypeOptions.map((t) => <SelectItem key={t.id} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                  <SelectItem value="__liab_header__" disabled className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Liabilities</SelectItem>
                  {liabilityTypeOptions.map((t) => <SelectItem key={t.id} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Color</Label>
              <ColorPicker value={accColor} onChange={setAccColor} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {isCreatingCreditCard ? 'Current Outstanding Balance (₱)' : accountTypeCategory(accType) === 'liability' ? 'Current Debt (₱)' : 'Current Balance (₱)'}
              </Label>
              {accountTypeCategory(accType) === 'liability' && !isCreatingCreditCard && (
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
            {isCreatingCreditCard && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-sm font-semibold">Credit Card Details</p>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Credit Limit (₱)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      value={accCreditLimit}
                      onChange={(e) => setAccCreditLimit(e.target.value)}
                      className="pl-7 h-10 rounded-xl"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">SOA Day</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="31"
                      value={accSoaDay}
                      onChange={(e) => setAccSoaDay(e.target.value)}
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Due Day</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="31"
                      value={accDueDay}
                      onChange={(e) => setAccDueDay(e.target.value)}
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Last Statement Date</Label>
                  <Input
                    type="date"
                    value={accLastStatementDate}
                    onChange={(e) => setAccLastStatementDate(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
                {createOutstanding > createCreditLimit && createCreditLimit > 0 && (
                  <p className="text-xs text-destructive">Outstanding balance cannot exceed the credit limit.</p>
                )}
                {createCreditPreview && (
                  <div className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground">
                    <p>Current Billing Cycle: <span className="font-medium text-foreground">{formatDateLabel(createCreditPreview.cycleStart)} - {formatDateLabel(createCreditPreview.cycleEnd)}</span></p>
                    <p>Next Statement Date: <span className="font-medium text-foreground">{formatDateLabel(createCreditPreview.nextStatement)}</span></p>
                    <p>Next Due Date: <span className="font-medium text-foreground">{formatDateLabel(createCreditPreview.dueDate)}</span></p>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setShowCreateAcc(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingAcc || !canSaveCreateAccount}>
                {isSavingAcc ? 'Saving…' : 'Add Account'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Account Type dialog ─────────────────────────── */}
      <Dialog open={!!editingType} onOpenChange={(open) => { if (!open) setEditingType(null) }}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Account Type</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateType} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Type Name</Label>
              <Input
                placeholder="e.g. Emergency Fund"
                value={editTypeName}
                onChange={(e) => setEditTypeName(e.target.value)}
                className="h-11 rounded-xl"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Category</Label>
              <Select value={editTypeCategory} onValueChange={(v: AccountCategory | null) => v && setEditTypeCategory(v)}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setEditingType(null)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingType || !editTypeName.trim()}>
                {isSavingType ? 'Saving…' : 'Save Changes'}
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
                  {assetTypeOptions.map((t) => <SelectItem key={t.id} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                  <SelectItem value="__liab_header__" disabled className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Liabilities</SelectItem>
                  {liabilityTypeOptions.map((t) => <SelectItem key={t.id} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Color</Label>
              <ColorPicker value={editAccColor} onChange={setEditAccColor} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {isEditingCreditCard ? 'Current Outstanding Balance (₱)' : accountTypeCategory(editAccType) === 'liability' ? 'Current Debt (₱)' : 'Current Balance (₱)'}
              </Label>
              {accountTypeCategory(editAccType) === 'liability' && !isEditingCreditCard && (
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
            {isEditingCreditCard && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-sm font-semibold">Credit Card Details</p>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Credit Limit (₱)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      value={editAccCreditLimit}
                      onChange={(e) => setEditAccCreditLimit(e.target.value)}
                      className="pl-7 h-10 rounded-xl"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">SOA Day</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="31"
                      value={editAccSoaDay}
                      onChange={(e) => setEditAccSoaDay(e.target.value)}
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Due Day</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="31"
                      value={editAccDueDay}
                      onChange={(e) => setEditAccDueDay(e.target.value)}
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Last Statement Date</Label>
                  <Input
                    type="date"
                    value={editAccLastStatementDate}
                    onChange={(e) => setEditAccLastStatementDate(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
                {editOutstanding > editCreditLimit && editCreditLimit > 0 && (
                  <p className="text-xs text-destructive">Outstanding balance cannot exceed the credit limit.</p>
                )}
                {editCreditPreview && (
                  <div className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground">
                    <p>Current Billing Cycle: <span className="font-medium text-foreground">{formatDateLabel(editCreditPreview.cycleStart)} - {formatDateLabel(editCreditPreview.cycleEnd)}</span></p>
                    <p>Next Statement Date: <span className="font-medium text-foreground">{formatDateLabel(editCreditPreview.nextStatement)}</span></p>
                    <p>Next Due Date: <span className="font-medium text-foreground">{formatDateLabel(editCreditPreview.dueDate)}</span></p>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setEditingAcc(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingAcc || !canSaveEditAccount}>
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
