'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useAccountDetail, AccountDetailEntry } from '@/hooks/useAccountDetail'
import { ACCOUNT_TYPES, CATEGORY_ICONS, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency } from '@/utils/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, TrendingUp, ArrowLeftRight, CreditCard, ArrowRight, HandCoins, Share2, UserPlus, X, Pencil,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { getContacts } from '@/services/contacts'
import {
  getSharedAccessForAccount,
  removeSharedFinancialAccountAccess,
  shareFinancialAccount,
} from '@/services/sharedFinancialAccounts'
import {
  Contact,
  SharedFinancialAccount,
  SharedFinancialAccountPermissionLevel,
  SharedFinancialAccountShareForm,
} from '@/types'

type KindFilter = 'all' | 'expenses' | 'income' | 'transfers'

interface Props {
  accountId: string
}

function formatDateLabel(value?: string | null) {
  if (!value) return 'Not set'
  return new Date(value + (value.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function AccountDetailClient({ accountId }: Props) {
  const { account, sharedAccess, entries, isLoading, moneyIn, moneyOut } = useAccountDetail(accountId)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [shares, setShares] = useState<SharedFinancialAccount[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showShare, setShowShare] = useState(false)
  const [editingShareId, setEditingShareId] = useState<string | null>(null)
  const [shareContactId, setShareContactId] = useState('')
  const [sharePermission, setSharePermission] = useState<SharedFinancialAccountPermissionLevel>('viewer')
  const [canViewBalance, setCanViewBalance] = useState(true)
  const [canViewExpenses, setCanViewExpenses] = useState(true)
  const [canViewReceipts, setCanViewReceipts] = useState(false)
  const [canViewItemization, setCanViewItemization] = useState(false)
  const [canAddExpense, setCanAddExpense] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const isSharedRecipient = Boolean(sharedAccess)
  const canShowBalance = !sharedAccess || sharedAccess.can_view_balance
  const isEditingShare = Boolean(editingShareId)

  const loadSharing = useCallback(async () => {
    if (!account || isSharedRecipient) return
    try {
      const [nextShares, nextContacts] = await Promise.all([
        getSharedAccessForAccount(account.id),
        getContacts(),
      ])
      setShares(nextShares)
      setContacts(nextContacts)
    } catch {
      toast.error('Failed to load shared access')
    }
  }, [account, isSharedRecipient])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadSharing()
    })
    return () => {
      cancelled = true
    }
  }, [loadSharing])

  const handlePermissionChange = (next: SharedFinancialAccountPermissionLevel) => {
    setSharePermission(next)
    if (next === 'viewer') {
      setCanAddExpense(false)
      return
    }
    setCanAddExpense(true)
    if (next === 'manager') {
      setCanViewReceipts(true)
      setCanViewItemization(true)
    }
  }

  const activeContacts = useMemo(() =>
    contacts.filter((contact) =>
      contact.contact_type === 'registered'
      && contact.link_status === 'connected'
      && contact.linked_user_id
      && (
        editingShareId
          ? shares.some((share) => share.id === editingShareId && share.shared_with_user_id === contact.linked_user_id)
          : !shares.some((share) => share.shared_with_user_id === contact.linked_user_id)
      )
    ),
    [contacts, editingShareId, shares]
  )

  const resetShareForm = () => {
    setEditingShareId(null)
    setShareContactId('')
    setSharePermission('viewer')
    setCanViewBalance(true)
    setCanViewExpenses(true)
    setCanViewReceipts(false)
    setCanViewItemization(false)
    setCanAddExpense(false)
  }

  const openShareDialog = () => {
    resetShareForm()
    setShowShare(true)
  }

  const openEditDialog = (share: SharedFinancialAccount) => {
    setEditingShareId(share.id)
    setShareContactId(share.contact_id ?? '')
    setSharePermission(share.permission_level)
    setCanViewBalance(share.can_view_balance)
    setCanViewExpenses(share.can_view_expenses)
    setCanViewReceipts(share.can_view_receipts)
    setCanViewItemization(share.can_view_itemization)
    setCanAddExpense(share.can_add_expense)
    setShowShare(true)
  }

  const handleShare = async () => {
    if (!account || !shareContactId) return
    setIsSharing(true)
    try {
      const payload: SharedFinancialAccountShareForm = {
        account_id: account.id,
        contact_id: shareContactId,
        permission_level: sharePermission,
        can_view_balance: canViewBalance,
        can_view_expenses: canViewExpenses,
        can_view_receipts: canViewReceipts,
        can_view_itemization: canViewItemization,
        can_add_expense: canAddExpense,
        can_edit_own_expense: sharePermission !== 'viewer',
        can_manage_sharing: sharePermission === 'manager',
      }
      await shareFinancialAccount(payload)
      toast.success(isEditingShare ? 'Permission updated' : 'Account shared')
      setShowShare(false)
      resetShareForm()
      await loadSharing()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to share account')
    } finally {
      setIsSharing(false)
    }
  }

  const handleRemoveShare = async (shareId: string) => {
    try {
      await removeSharedFinancialAccountAccess(shareId)
      setShares((prev) => prev.filter((share) => share.id !== shareId))
      toast.success('Access removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove access')
    }
  }

  const filtered = useMemo(() =>
    kindFilter === 'all' ? entries :
    entries.filter((e) =>
      kindFilter === 'expenses'  ? (e.kind === 'expense' || e.kind === 'shared_expense') :
      kindFilter === 'income'    ? e.kind === 'income' :
      e.kind === 'transfer' || e.kind === 'personal_settlement'
    ),
    [entries, kindFilter]
  )

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-6 w-36 rounded-xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-10 rounded-xl" />
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
      </div>
    )
  }

  if (!account) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Link href="/activity/accounts" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to Accounts
        </Link>
        <div className="text-center py-16 space-y-2">
          <p className="text-4xl">🔍</p>
          <p className="font-semibold">Account not found</p>
        </div>
      </div>
    )
  }

  const isLiab    = account.category === 'liability'
  const typeInfo  = ACCOUNT_TYPES.find((t) => t.value === account.type)

  const balanceDisplay = isLiab
    ? account.balance < 0 ? `${formatCurrency(Math.abs(account.balance))} owed` : 'No debt'
    : formatCurrency(account.balance)

  const balanceColor = isLiab
    ? account.balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
    : account.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  const isCreditCard = account.type === 'credit'

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">

      {/* Back nav */}
      <Link
        href="/activity/accounts"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Accounts
      </Link>

      {/* Account header card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-accent/60 flex items-center justify-center text-2xl flex-shrink-0">
            {account.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{account.name}</h1>
            <p className="text-xs text-muted-foreground">
              {typeInfo?.label ?? account.type}
              {isLiab && <span className="ml-1.5 text-amber-500 font-medium">· Liability</span>}
            </p>
          </div>
        </div>

        {/* Balance + in/out stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-muted/60 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">{isLiab ? 'Current Debt' : 'Balance'}</p>
            <p className={cn('text-sm font-bold tabular-nums leading-tight', balanceColor)}>
              {canShowBalance ? balanceDisplay : 'Hidden'}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">{isLiab ? 'Paid Off' : 'Money In'}</p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">
              {canShowBalance ? `+${formatCurrency(moneyIn)}` : 'Hidden'}
            </p>
          </div>
          <div className="rounded-xl bg-rose-500/10 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">{isLiab ? 'Charged' : 'Money Out'}</p>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums leading-tight">
              {canShowBalance ? `-${formatCurrency(moneyOut)}` : 'Hidden'}
            </p>
          </div>
        </div>

        {isCreditCard && (
          <div className="rounded-xl bg-muted/60 p-3 space-y-2">
            <p className="text-xs font-semibold">Credit Card Details</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Credit Limit</p>
                <p className="font-semibold">{formatCurrency(account.credit_limit ?? 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Outstanding</p>
                <p className="font-semibold">{formatCurrency(Math.abs(account.balance))}</p>
              </div>
              <div>
                <p className="text-muted-foreground">SOA Day</p>
                <p className="font-semibold">{account.soa_day ?? '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Due Day</p>
                <p className="font-semibold">{account.due_day ?? '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Last Statement Date</p>
                <p className="font-semibold">{formatDateLabel(account.last_statement_date)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {isSharedRecipient && sharedAccess ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Shared With Me</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Owner: {sharedAccess.owner_email ?? 'Account owner'} · Permission: {sharedAccess.permission_level}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sharedAccess.can_view_balance && <PermissionPill label="Balance" />}
            {sharedAccess.can_view_expenses && <PermissionPill label="Expenses" />}
            {sharedAccess.can_view_receipts && <PermissionPill label="Receipts" />}
            {sharedAccess.can_view_itemization && <PermissionPill label="Itemization" />}
            {sharedAccess.can_add_expense && <PermissionPill label="Add Expense" />}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm">Shared Access</h2>
            </div>
            <Button type="button" size="sm" className="h-8 rounded-xl gap-1.5 text-xs" onClick={openShareDialog}>
              <UserPlus className="w-3.5 h-3.5" />
              Share
            </Button>
          </div>

          {shares.length === 0 ? (
            <p className="text-xs text-muted-foreground">No contacts have access to this account.</p>
          ) : (
            <div className="space-y-2">
              {shares.map((share) => (
                <div key={share.id} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{share.contacts?.name ?? share.contacts?.email ?? 'Shared contact'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {share.permission_level} · {share.status}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8 w-8 rounded-xl p-0" onClick={() => openEditDialog(share)} title="Edit permission">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 w-8 rounded-xl p-0" onClick={() => handleRemoveShare(share.id)} title="Remove access">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kind filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
        {([
          { value: 'all',       label: 'All' },
          { value: 'expenses',  label: '💸 Expenses' },
          { value: 'income',    label: '💰 Income' },
          { value: 'transfers', label: '🔄 Transfers' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setKindFilter(value)}
            className={cn(
              'flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
              kindFilter === value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-accent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Activity feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Transaction History</h2>
          <p className="text-xs text-muted-foreground">{filtered.length} entries</p>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-14 rounded-2xl border border-dashed border-border space-y-2">
            <p className="text-3xl">📭</p>
            <p className="font-semibold text-sm">No activity yet</p>
            <p className="text-xs text-muted-foreground">
              {kindFilter === 'all'
                ? 'Transactions linked to this account will appear here'
                : `No ${kindFilter} recorded for this account`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <AccountDetailEntryItem
                key={`${entry.kind}-${entry.id}`}
                entry={entry}
                isLiab={isLiab}
                canViewReceipts={!sharedAccess || sharedAccess.can_view_receipts}
                accountName={account.name}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={showShare} onOpenChange={(open) => {
        setShowShare(open)
        if (!open) resetShareForm()
      }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>{isEditingShare ? 'Edit Permission' : 'Share Account'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Contact</Label>
              <Select value={shareContactId} onValueChange={(v: string | null) => setShareContactId(v ?? '')} disabled={isEditingShare}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select connected contact" /></SelectTrigger>
                <SelectContent>
                  {activeContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>{contact.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeContacts.length === 0 && (
                <p className="text-xs text-muted-foreground">Only connected registered contacts can receive account access.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Permission</Label>
              <Select value={sharePermission} onValueChange={(v: string | null) => handlePermissionChange((v ?? 'viewer') as SharedFinancialAccountPermissionLevel)}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="contributor">Contributor</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ToggleRow label="View Balance" checked={canViewBalance} onChange={setCanViewBalance} />
              <ToggleRow label="View Expenses" checked={canViewExpenses} onChange={setCanViewExpenses} />
              <ToggleRow label="View Receipts" checked={canViewReceipts} onChange={setCanViewReceipts} />
              <ToggleRow label="View Itemization" checked={canViewItemization} onChange={setCanViewItemization} />
              <ToggleRow label="Add Expense" checked={canAddExpense} onChange={setCanAddExpense} disabled={sharePermission === 'viewer'} />
            </div>

            <Button type="button" className="w-full h-11 rounded-xl" disabled={isSharing || !shareContactId} onClick={handleShare}>
              {isSharing ? (isEditingShare ? 'Updating...' : 'Sharing...') : (isEditingShare ? 'Update Permission' : 'Share Account')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PermissionPill({ label }: { label: string }) {
  return <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{label}</span>
}

function ToggleRow({
  label, checked, onChange, disabled,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={cn('flex items-center gap-2 rounded-xl border border-border p-2.5 text-xs font-medium', disabled && 'opacity-50')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary"
      />
      {label}
    </label>
  )
}

function AccountDetailEntryItem({
  entry,
  isLiab,
  canViewReceipts,
  accountName,
}: {
  entry: AccountDetailEntry
  isLiab: boolean
  canViewReceipts: boolean
  accountName: string
}) {
  const date = new Date(entry.date).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const collaboratorCreated = entry.kind === 'expense'
    && entry.createdByUserId
    && entry.ownerUserId
    && entry.createdByUserId !== entry.ownerUserId

  if (entry.kind === 'expense') {
    const icon  = CATEGORY_ICONS[entry.category] ?? '📦'
    const color = CATEGORY_COLORS[entry.category] ?? '#6B7280'
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
            isLiab ? 'bg-amber-500/10' : 'bg-rose-500/10'
          )}
        >
          {isLiab
            ? <CreditCard className="w-4 h-4 text-amber-500" />
            : <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
          }
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isLiab ? 'text-amber-500' : 'text-rose-500')}>
              {isLiab ? 'Credit Charge' : 'Expense'}
            </span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
          </div>
          <p className="text-sm font-semibold truncate">{entry.note || entry.category}</p>
          <p className="text-[10px] text-muted-foreground">
            <span style={{ backgroundColor: color + '20', borderRadius: 4, padding: '1px 5px' }}>
              {icon} {entry.category}
            </span>
          </p>
          {(collaboratorCreated || entry.hasReceipt) && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              {collaboratorCreated && (
                <>
                  <span>Created by: {entry.createdByLabel}</span>
                  <span>Paid from: {accountName}</span>
                  <span>Owner: {entry.ownerLabel}</span>
                </>
              )}
              {entry.hasReceipt && canViewReceipts && <span>Receipt attached</span>}
            </div>
          )}
        </div>
        <p className={cn('text-sm font-bold tabular-nums flex-shrink-0', isLiab ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')}>
          {isLiab ? `+${formatCurrency(entry.amount)} debt` : `-${formatCurrency(entry.amount)}`}
        </p>
      </div>
    )
  }

  if (entry.kind === 'shared_expense') {
    const icon  = CATEGORY_ICONS[entry.category] ?? '📦'
    const color = CATEGORY_COLORS[entry.category] ?? '#6B7280'
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
            isLiab ? 'bg-amber-500/10' : 'bg-rose-500/10'
          )}
        >
          {isLiab
            ? <CreditCard className="w-4 h-4 text-amber-500" />
            : <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
          }
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isLiab ? 'text-amber-500' : 'text-rose-500')}>
              {isLiab ? 'Shared Charge' : 'Shared Expense'}
            </span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
          </div>
          <p className="text-sm font-semibold truncate">{entry.note || entry.category}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ backgroundColor: color + '20', borderRadius: 4, padding: '1px 5px' }}>
              {icon} {entry.category}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {entry.groupEmoji} {entry.groupName}
            </span>
          </div>
        </div>
        <p className={cn('text-sm font-bold tabular-nums flex-shrink-0', isLiab ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')}>
          {isLiab ? `+${formatCurrency(entry.amount)} debt` : `-${formatCurrency(entry.amount)}`}
        </p>
      </div>
    )
  }

  if (entry.kind === 'income') {
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Income</span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
          </div>
          <p className="text-sm font-semibold truncate">
            {entry.sourceEmoji} {entry.sourceName}
          </p>
          {entry.note && <p className="text-[10px] text-muted-foreground truncate">{entry.note}</p>}
        </div>
        <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 flex-shrink-0">
          +{formatCurrency(entry.amount)}
        </p>
      </div>
    )
  }

  if (entry.kind === 'personal_settlement') {
    const incoming = entry.direction === 'in'
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${incoming ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
          <HandCoins className={`w-4 h-4 ${incoming ? 'text-emerald-500' : 'text-amber-500'}`} />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${incoming ? 'text-emerald-500' : 'text-amber-500'}`}>
              Personal Settlement
            </span>
            <span className="text-[10px] text-muted-foreground">· {date}</span>
            {entry.status === 'pending_confirmation' && (
              <span className="text-[10px] text-blue-500">· Pending</span>
            )}
          </div>
          <p className="text-sm font-semibold truncate">
            {incoming ? `Received from ${entry.contactName}` : `Paid ${entry.contactName}`}
          </p>
          {entry.note && <p className="text-[10px] text-muted-foreground truncate">{entry.note}</p>}
        </div>
        <p className={`text-sm font-bold tabular-nums flex-shrink-0 ${incoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {incoming ? '+' : '-'}{formatCurrency(entry.amount)}
        </p>
      </div>
    )
  }

  // Transfer
  const isIn = entry.direction === 'in'
  const otherIsLiab = entry.otherAccount.category === 'liability'
  const transferFee = entry.transferFee
  const totalDeducted = entry.amount + transferFee

  let amountLabel: string
  let amountColor: string
  if (isLiab) {
    amountLabel = isIn ? `-${formatCurrency(entry.amount)} debt paid` : `+${formatCurrency(entry.amount)} debt`
    amountColor = isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  } else {
    amountLabel = isIn ? `+${formatCurrency(entry.amount)}` : `-${formatCurrency(entry.amount)}`
    amountColor = isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  }

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <ArrowLeftRight className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Transfer</span>
          <span className="text-[10px] text-muted-foreground">· {date}</span>
        </div>
        <div className="flex items-center gap-1 text-sm font-semibold flex-wrap">
          {isIn ? (
            <>
              <span>{entry.otherAccount.emoji} {entry.otherAccount.name}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-primary">This account</span>
            </>
          ) : (
            <>
              <span className="text-primary">This account</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span>{entry.otherAccount.emoji} {entry.otherAccount.name}</span>
              {otherIsLiab && <span className="text-[10px] text-amber-500 font-medium">(credit payment)</span>}
            </>
          )}
        </div>
        {entry.note && <p className="text-[10px] text-muted-foreground truncate">{entry.note}</p>}
        <p className="text-[10px] text-muted-foreground">
          Transferred: {formatCurrency(entry.amount)}
          {transferFee > 0 && !isIn
            ? ` · Fee: ${formatCurrency(transferFee)} · Total deducted: ${formatCurrency(totalDeducted)}`
            : ` · Fee: ${formatCurrency(transferFee)}`}
        </p>
      </div>
      <p className={cn('text-sm font-bold tabular-nums flex-shrink-0', amountColor)}>
        {amountLabel}
      </p>
    </div>
  )
}
