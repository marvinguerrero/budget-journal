'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories } from '@/hooks/useCategories'
import { useExpenses } from '@/hooks/useExpenses'
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { getCurrentMonth, formatCurrency } from '@/utils/format'
import {
  convertWishlistToBudget,
  createWishlistItem,
  getSharedWishlistItems,
  getWishlistItems,
  getWishlistShares,
  shareWishlist,
  stopWishlistShare,
  updateWishlistItem,
  updateWishlistStatus,
} from '@/services/wishlist'
import { getContacts } from '@/services/contacts'
import { Contact, SharedWishlistItem, WishlistFormData, WishlistItem, WishlistPriority, WishlistShare, WishlistShareMode } from '@/types'
import { CheckCircle2, ExternalLink, Gift, Pencil, Plus, Share2, Users, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIORITIES: Array<{ value: WishlistPriority; label: string }> = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const statusStyles = {
  wishlist: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  budgeted: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  purchased: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-muted text-muted-foreground',
}

const priorityStyles = {
  high: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  low: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
}

function getWishlistAgeDays(createdAt: string) {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return 0

  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startCreated = new Date(created.getFullYear(), created.getMonth(), created.getDate())
  return Math.max(0, Math.floor((startToday.getTime() - startCreated.getTime()) / 86_400_000))
}

function formatWishlistAge(createdAt: string) {
  const days = getWishlistAgeDays(createdAt)
  if (days === 0) return 'Wished today'
  if (days === 1) return 'Wished 1 day ago'
  return `Wished ${days} days ago`
}

function formatWishlistAgeValue(createdAt: string) {
  const days = getWishlistAgeDays(createdAt)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function blankForm(category: string): WishlistFormData {
  return {
    name: '',
    target_amount: 0,
    category,
    priority: 'medium',
    notes: '',
    product_url: '',
    quantity: 1,
  }
}

export default function WishlistPage() {
  const { month, year } = getCurrentMonth()
  const { expenses } = useExpenses(month, year)
  const { categories } = useCategories()
  const [items, setItems] = useState<WishlistItem[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [shares, setShares] = useState<WishlistShare[]>([])
  const [sharedWithMe, setSharedWithMe] = useState<SharedWishlistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<WishlistItem | null>(null)
  const [sharedDetailItem, setSharedDetailItem] = useState<SharedWishlistItem | null>(null)
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null)
  const [shareMode, setShareMode] = useState<WishlistShareMode>('single')
  const [shareItemIds, setShareItemIds] = useState<string[]>([])
  const [shareContactIds, setShareContactIds] = useState<string[]>([])
  const [shareNotes, setShareNotes] = useState(true)
  const [shareProductLinks, setShareProductLinks] = useState(true)
  const [sharePrices, setSharePrices] = useState(true)
  const allCategories = categories.length > 0
    ? categories
    : DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `d-${i}`, user_id: null, is_default: true, created_at: '' }))
  const [form, setForm] = useState<WishlistFormData>(() => blankForm(allCategories[0]?.name ?? 'Shopping'))

  const stats = useMemo(() => {
    const active = items.filter((item) => item.status !== 'cancelled')
    return {
      count: active.length,
      target: active.reduce((sum, item) => sum + item.target_amount, 0),
      budgeted: items.filter((item) => item.status === 'budgeted').length,
      purchased: items.filter((item) => item.status === 'purchased').length,
    }
  }, [items])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    Promise.all([
      getWishlistItems(),
      getContacts(),
      getWishlistShares(),
      getSharedWishlistItems(),
    ])
      .then(([wishlist, contactRows, shareRows, sharedRows]) => {
        if (cancelled) return
        setItems(wishlist)
        setContacts(contactRows)
        setShares(shareRows)
        setSharedWithMe(sharedRows)
      })
      .catch(() => { if (!cancelled) toast.error('Failed to load wishlist') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const activeContacts = contacts.filter((contact) =>
    contact.contact_type === 'registered'
    && contact.link_status === 'connected'
    && Boolean(contact.linked_user_id)
  )
  const activeItems = items.filter((item) => item.status !== 'cancelled')
  const sharedByOwner = Object.values(sharedWithMe.reduce<Record<string, { owner: string; items: SharedWishlistItem[] }>>((groups, item) => {
    groups[item.owner_user_id] ??= { owner: item.owner_name, items: [] }
    groups[item.owner_user_id].items.push(item)
    return groups
  }, {}))

  const refreshItem = (item: WishlistItem) => {
    setItems((prev) => prev.map((existing) => existing.id === item.id ? item : existing))
    setDetailItem((current) => current?.id === item.id ? item : current)
  }

  const openCreate = () => {
    setEditingItem(null)
    setForm(blankForm(allCategories[0]?.name ?? 'Shopping'))
    setFormOpen(true)
  }

  const openShare = (item?: WishlistItem) => {
    setShareMode(item ? 'single' : 'entire')
    setShareItemIds(item ? [item.id] : [])
    setShareContactIds([])
    setShareNotes(true)
    setShareProductLinks(true)
    setSharePrices(true)
    setShareOpen(true)
  }

  const openEdit = (item: WishlistItem) => {
    setEditingItem(item)
    setForm({
      name: item.name,
      target_amount: item.target_amount,
      category: item.category,
      priority: item.priority ?? 'medium',
      notes: item.notes,
      product_url: item.product_url ?? '',
      quantity: item.quantity,
    })
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || form.target_amount <= 0 || !form.category.trim()) return
    setIsSaving(true)
    try {
      const saved = editingItem
        ? await updateWishlistItem(editingItem.id, form)
        : await createWishlistItem(form)
      setItems((prev) => editingItem
        ? prev.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...prev])
      setDetailItem((current) => current?.id === saved.id ? saved : current)
      setFormOpen(false)
      toast.success(editingItem ? 'Wishlist updated' : 'Wishlist item added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save wishlist item')
    } finally {
      setIsSaving(false)
    }
  }

  const handleConvert = async (item: WishlistItem) => {
    setIsSaving(true)
    try {
      const updated = await convertWishlistToBudget(item.id, month, year)
      refreshItem(updated)
      toast.success('Wishlist converted to budget')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to convert wishlist')
    } finally {
      setIsSaving(false)
    }
  }

  const handleStatus = async (item: WishlistItem, status: 'purchased' | 'cancelled' | 'wishlist') => {
    setIsSaving(true)
    try {
      const updated = await updateWishlistStatus(item.id, status)
      refreshItem(updated)
      toast.success(status === 'purchased' ? 'Marked as purchased' : status === 'cancelled' ? 'Wishlist cancelled' : 'Wishlist restored')
    } catch {
      toast.error('Failed to update wishlist status')
    } finally {
      setIsSaving(false)
    }
  }

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault()
    if (shareContactIds.length === 0) {
      toast.error('Select at least one contact.')
      return
    }
    if (shareMode !== 'entire' && shareItemIds.length === 0) {
      toast.error('Select at least one wishlist item.')
      return
    }

    setIsSaving(true)
    try {
      await shareWishlist({
        contactIds: shareContactIds,
        mode: shareMode,
        itemIds: shareMode === 'entire' ? [] : shareItemIds,
        shareNotes,
        shareProductLinks,
        sharePrices,
      })
      const updatedShares = await getWishlistShares()
      setShares(updatedShares)
      setShareOpen(false)
      toast.success('Wishlist shared')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to share wishlist')
    } finally {
      setIsSaving(false)
    }
  }

  const handleStopShare = async (share: WishlistShare) => {
    setIsSaving(true)
    try {
      await stopWishlistShare(share.id)
      setShares((prev) => prev.filter((item) => item.id !== share.id))
      toast.success('Sharing stopped')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop sharing')
    } finally {
      setIsSaving(false)
    }
  }

  const linkedProgress = detailItem?.budgets
    ? (() => {
      const budget = detailItem.budgets
      const spent = expenses
        .filter((expense) => expense.category === budget.category)
        .reduce((sum, expense) => sum + expense.amount, 0)
      return { budget, spent, remaining: budget.amount - spent }
    })()
    : null

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Wishlist</h1>
          <p className="text-sm text-muted-foreground">Track future purchases before they become budgets</p>
        </div>
        <Button size="sm" className="h-9 rounded-xl gap-1.5" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5" onClick={() => openShare()} disabled={activeItems.length === 0}>
          <Share2 className="w-4 h-4" />
          Share Wishlist
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: String(stats.count) },
          { label: 'Target', value: formatCurrency(stats.target) },
          { label: 'Budgeted', value: String(stats.budgeted) },
          { label: 'Purchased', value: String(stats.purchased) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-3">
            <p className="font-bold text-base tabular-nums">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Gift className="w-8 h-8 text-primary" />
            </div>
          </div>
          <p className="font-semibold">No wishlist items yet</p>
          <p className="text-sm text-muted-foreground">Save things you want before turning them into budgets.</p>
          <Button className="rounded-xl" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Wishlist Item
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDetailItem(item)}
              className="w-full text-left p-3.5 rounded-2xl border border-border bg-card hover:border-border/80 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category} · {formatWishlistAge(item.created_at)}</p>
                </div>
                <p className="font-bold text-sm tabular-nums flex-shrink-0">{formatCurrency(item.target_amount)}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {item.priority && (
                  <span className={cn('px-2 py-1 rounded-lg text-xs font-semibold capitalize', priorityStyles[item.priority])}>
                    {item.priority}
                  </span>
                )}
                <span className={cn('px-2 py-1 rounded-lg text-xs font-semibold capitalize', statusStyles[item.status])}>
                  {item.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Wishlist Item' : 'Add Wishlist Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="MacBook Air M4"
                className="h-11 rounded-xl"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Target Amount</Label>
                <Input
                  type="number"
                  min="1"
                  inputMode="decimal"
                  value={form.target_amount || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, target_amount: Number(e.target.value) }))}
                  className="h-11 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantity ?? 1}
                  onChange={(e) => setForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(value: string | null) => value && setForm((prev) => ({ ...prev, category: value }))}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allCategories.map((cat) => (
                      <SelectItem key={cat.name} value={cat.name}>{cat.icon} {cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority ?? 'medium'} onValueChange={(value: string | null) => value && setForm((prev) => ({ ...prev, priority: value as WishlistPriority }))}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((priority) => (
                      <SelectItem key={priority.value} value={priority.value}>{priority.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Product URL</Label>
              <Input
                type="url"
                value={form.product_url ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, product_url: e.target.value }))}
                placeholder="https://..."
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={form.notes ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="For work and development"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingItem ? 'Save' : 'Add'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          {detailItem && (
            <>
              <DialogHeader>
                <DialogTitle>{detailItem.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Detail label="Target" value={formatCurrency(detailItem.target_amount)} />
                  <Detail label="Category" value={detailItem.category} />
                  <Detail label="Priority" value={detailItem.priority ? detailItem.priority[0].toUpperCase() + detailItem.priority.slice(1) : 'None'} />
                  <Detail label="Quantity" value={String(detailItem.quantity)} />
                  <Detail label="Status" value={detailItem.status[0].toUpperCase() + detailItem.status.slice(1)} />
                  <Detail label="Age" value={formatWishlistAgeValue(detailItem.created_at)} />
                </div>

                {detailItem.notes && (
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm mt-1">{detailItem.notes}</p>
                  </div>
                )}

                {detailItem.product_url && (
                  <Link
                    href={detailItem.product_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Product
                  </Link>
                )}

                {linkedProgress && (
                  <div className="rounded-2xl border border-border p-3 space-y-2">
                    <p className="text-sm font-semibold">Linked Budget</p>
                    <p className="text-sm">{linkedProgress.budget.category} → {linkedProgress.budget.item ?? detailItem.name}</p>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, (linkedProgress.spent / linkedProgress.budget.amount) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatCurrency(linkedProgress.spent)} used</span>
                      <span>{formatCurrency(Math.max(0, linkedProgress.remaining))} remaining</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={() => openEdit(detailItem)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={() => openShare(detailItem)}>
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                  {detailItem.status !== 'budgeted' && detailItem.status !== 'purchased' && detailItem.status !== 'cancelled' && (
                    <Button className="rounded-xl" disabled={isSaving} onClick={() => handleConvert(detailItem)}>
                      Convert to Budget
                    </Button>
                  )}
                  {detailItem.status !== 'purchased' && detailItem.status !== 'cancelled' && (
                    <Button variant="outline" className="rounded-xl" disabled={isSaving} onClick={() => handleStatus(detailItem, 'purchased')}>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Purchased
                    </Button>
                  )}
                  {detailItem.status !== 'cancelled' ? (
                    <Button variant="outline" className="rounded-xl text-destructive hover:text-destructive" disabled={isSaving} onClick={() => handleStatus(detailItem, 'cancelled')}>
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  ) : (
                    <Button variant="outline" className="rounded-xl" disabled={isSaving} onClick={() => handleStatus(detailItem, 'wishlist')}>
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!sharedDetailItem} onOpenChange={(open) => !open && setSharedDetailItem(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          {sharedDetailItem && (
            <>
              <DialogHeader>
                <DialogTitle>{sharedDetailItem.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Detail label="Shared By" value={sharedDetailItem.owner_name} />
                  <Detail label="Category" value={sharedDetailItem.category} />
                  <Detail label="Priority" value={sharedDetailItem.priority ? sharedDetailItem.priority[0].toUpperCase() + sharedDetailItem.priority.slice(1) : 'None'} />
                  <Detail label="Quantity" value={String(sharedDetailItem.quantity)} />
                  <Detail label="Status" value={sharedDetailItem.status[0].toUpperCase() + sharedDetailItem.status.slice(1)} />
                  <Detail label="Age" value={formatWishlistAgeValue(sharedDetailItem.created_at)} />
                  {sharedDetailItem.target_amount !== null && (
                    <Detail label="Target" value={formatCurrency(sharedDetailItem.target_amount)} />
                  )}
                </div>

                {sharedDetailItem.share_notes && sharedDetailItem.notes && (
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm mt-1">{sharedDetailItem.notes}</p>
                  </div>
                )}

                {sharedDetailItem.share_product_links && sharedDetailItem.product_url && (
                  <Link
                    href={sharedDetailItem.product_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Product
                  </Link>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Share Wishlist</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleShare} className="space-y-4">
            <div className="space-y-2">
              <Label>Share Options</Label>
              <Select value={shareMode} onValueChange={(value: string | null) => {
                if (!value) return
                const next = value as WishlistShareMode
                setShareMode(next)
                setShareItemIds(next === 'entire' ? [] : shareItemIds.slice(0, next === 'single' ? 1 : undefined))
              }}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Share Selected Item</SelectItem>
                  <SelectItem value="multiple">Share Multiple Items</SelectItem>
                  <SelectItem value="entire">Share Entire Wishlist</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {shareMode !== 'entire' && (
              <Checklist
                title="Wishlist Items"
                items={activeItems.map((item) => ({ id: item.id, label: item.name }))}
                selected={shareItemIds}
                single={shareMode === 'single'}
                onChange={setShareItemIds}
              />
            )}

            <Checklist
              title="Share With"
              items={activeContacts.map((contact) => ({ id: contact.id, label: contact.name }))}
              selected={shareContactIds}
              onChange={setShareContactIds}
              emptyLabel="No connected contacts yet"
            />

            <div className="space-y-2">
              <Label>Privacy</Label>
              {[
                { label: 'Share Notes', value: shareNotes, set: setShareNotes },
                { label: 'Share Product Links', value: shareProductLinks, set: setShareProductLinks },
                { label: 'Share Prices', value: sharePrices, set: setSharePrices },
              ].map((option) => (
                <label key={option.label} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                  <span>{option.label}</span>
                  <input
                    type="checkbox"
                    checked={option.value}
                    onChange={(event) => option.set(event.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setShareOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl" disabled={isSaving || activeContacts.length === 0}>
                {isSaving ? 'Sharing...' : 'Share'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {(shares.length > 0 || sharedByOwner.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-4">
          {shares.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Shared Wishlist</h2>
              </div>
              {shares.map((share) => (
                <div key={share.id} className="rounded-2xl border border-border bg-card p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">{share.contacts?.name ?? 'Contact'}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {share.mode === 'entire' ? 'Entire Wishlist' : 'Selected Items'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" disabled={isSaving} onClick={() => handleStopShare(share)}>
                    Stop
                  </Button>
                </div>
              ))}
            </section>
          )}

          {sharedByOwner.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Shared With Me</h2>
              </div>
              {sharedByOwner.map((group) => (
                <div key={group.owner} className="rounded-2xl border border-border bg-card p-3 space-y-2">
                  <p className="font-semibold text-sm">{group.owner}</p>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <button
                        key={`${item.share_id}-${item.item_id}`}
                        type="button"
                        onClick={() => setSharedDetailItem(item)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl p-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{item.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.category} · {formatWishlistAge(item.created_at)}</span>
                        </span>
                        {item.target_amount !== null && (
                          <span className="font-semibold tabular-nums">{formatCurrency(item.target_amount)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-1">{value}</p>
    </div>
  )
}

function Checklist({
  title,
  items,
  selected,
  onChange,
  single = false,
  emptyLabel = 'No items available',
}: {
  title: string
  items: Array<{ id: string; label: string }>
  selected: string[]
  onChange: (ids: string[]) => void
  single?: boolean
  emptyLabel?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      {items.length === 0 ? (
        <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {items.map((item) => {
            const checked = selected.includes(item.id)
            return (
              <label key={item.id} className="flex items-center gap-3 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (single) {
                      onChange(checked ? [] : [item.id])
                      return
                    }
                    onChange(checked ? selected.filter((id) => id !== item.id) : [...selected, item.id])
                  }}
                  className="h-4 w-4"
                />
                <span className="truncate">{item.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
