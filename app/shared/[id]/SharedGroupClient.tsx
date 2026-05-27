'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SharedGroup, SharedGroupMember, SharedBudget, SharedExpense, PermissionRequest } from '@/types'
import {
  getSharedGroupDetails,
  inviteMember,
  removeMember,
  leaveGroup,
  deleteSharedGroup,
  updateMemberPermissions,
} from '@/services/sharedGroups'
import { createSharedBudget, updateSharedBudget, deleteSharedBudget } from '@/services/sharedBudgets'
import { createSharedExpense, updateSharedExpense, deleteSharedExpense } from '@/services/sharedExpenses'
import {
  createPermissionRequest,
  approvePermissionRequest,
  rejectPermissionRequest,
} from '@/services/permissionRequests'
import { MemberCapabilities, resolveCapabilities } from '@/lib/permissions'
import { MembersSection } from '@/components/shared/MembersSection'
import { SharedBudgetProgress } from '@/components/shared/SharedBudgetProgress'
import { SharedExpenseItem } from '@/components/shared/SharedExpenseItem'
import { GroupChat } from '@/components/shared/GroupChat'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BottomSheet } from '@/components/common/BottomSheet'
import { useIsMobile } from '@/hooks/useIsMobile'
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { formatCurrency, formatShortDate } from '@/utils/format'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Plus,
  MoreHorizontal,
  Trash2,
  LogOut,
  Target,
  Users,
} from 'lucide-react'

interface Props {
  groupId: string
  currentUserId: string
  currentUserEmail: string
}

export function SharedGroupClient({ groupId, currentUserId, currentUserEmail }: Props) {
  const router = useRouter()
  const isMobile = useIsMobile()

  const [group, setGroup] = useState<SharedGroup | null>(null)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [members, setMembers] = useState<SharedGroupMember[]>([])
  const [budgets, setBudgets] = useState<SharedBudget[]>([])
  const [expenses, setExpenses] = useState<SharedExpense[]>([])
  const [requests, setRequests] = useState<PermissionRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // dialog open states
  const [activeTab, setActiveTab] = useState<'overview' | 'chat'>('overview')
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showAddBudget, setShowAddBudget] = useState(false)
  const [showInvite, setShowInvite] = useState(false)

  // form state
  const [expenseCategory, setExpenseCategory] = useState(DEFAULT_CATEGORIES[0].name)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseNote, setExpenseNote] = useState('')
  const [budgetCategory, setBudgetCategory] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteCanEdit, setInviteCanEdit] = useState(false)
  const [inviteCanInvite, setInviteCanInvite] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // edit expense
  const [editingExpense, setEditingExpense] = useState<SharedExpense | null>(null)
  const [editExpenseCategory, setEditExpenseCategory] = useState('')
  const [editExpenseAmount, setEditExpenseAmount] = useState('')
  const [editExpenseNote, setEditExpenseNote] = useState('')

  // edit budget
  const [editingBudget, setEditingBudget] = useState<SharedBudget | null>(null)
  const [editBudgetAmount, setEditBudgetAmount] = useState('')

  const isOwner = group?.owner_id === currentUserId

  const myPerms: MemberCapabilities = useMemo(() => {
    const myMember = members.find((m) => m.user_id === currentUserId)
    return resolveCapabilities(isOwner, myMember)
  }, [isOwner, members, currentUserId])

  const load = useCallback(async () => {
    try {
      const details = await getSharedGroupDetails(groupId)
      setGroup(details.group)
      setOwnerEmail(details.ownerEmail)
      setMembers(details.members)
      setBudgets(details.budgets)
      setExpenses(details.expenses)
      setRequests(details.requests)
    } catch {
      toast.error('Failed to load group')
      router.push('/shared')
    } finally {
      setIsLoading(false)
    }
  }, [groupId, router])

  useEffect(() => { load() }, [load])

  // ── Stats ────────────────────────────────────────────────────
  const totalBudget = useMemo(() => budgets.reduce((s, b) => s + b.amount, 0), [budgets])
  const totalSpent = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses])
  const totalRemaining = totalBudget - totalSpent

  const coveredCategories = new Set(budgets.map((b) => b.category))
  const availableBudgetCategories = DEFAULT_CATEGORIES.filter((c) => !coveredCategories.has(c.name))

  // ── Expense handlers ────────────────────────────────────────
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(expenseAmount)
    if (!amt || amt <= 0) return
    setIsSaving(true)
    try {
      const exp = await createSharedExpense(groupId, expenseCategory, amt, expenseNote)
      setExpenses((prev) => [exp, ...prev])
      setShowAddExpense(false)
      setExpenseAmount('')
      setExpenseNote('')
      toast.success('Expense added!')
    } catch {
      toast.error('Failed to add expense')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteSharedExpense(id)
      setExpenses((prev) => prev.filter((e) => e.id !== id))
      toast.success('Expense deleted')
    } catch {
      toast.error('Failed to delete expense')
    }
  }

  // ── Budget handlers ─────────────────────────────────────────
  const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(budgetAmount)
    if (!budgetCategory || !amt || amt <= 0) return
    setIsSaving(true)
    try {
      const bud = await createSharedBudget(groupId, budgetCategory, amt)
      setBudgets((prev) => {
        const exists = prev.findIndex((b) => b.id === bud.id)
        return exists >= 0 ? prev.map((b) => (b.id === bud.id ? bud : b)) : [...prev, bud]
      })
      setShowAddBudget(false)
      setBudgetCategory('')
      setBudgetAmount('')
      toast.success('Budget set!')
    } catch {
      toast.error('Failed to set budget')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteBudget = async (id: string) => {
    try {
      await deleteSharedBudget(id)
      setBudgets((prev) => prev.filter((b) => b.id !== id))
      toast.success('Budget removed')
    } catch {
      toast.error('Failed to remove budget')
    }
  }

  const openEditExpense = (expense: SharedExpense) => {
    setEditingExpense(expense)
    setEditExpenseCategory(expense.category)
    setEditExpenseAmount(String(expense.amount))
    setEditExpenseNote(expense.note)
  }

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingExpense) return
    const amt = parseFloat(editExpenseAmount)
    if (!amt || amt <= 0) return
    setIsSaving(true)
    try {
      await updateSharedExpense(editingExpense.id, editExpenseCategory, amt, editExpenseNote)
      setExpenses((prev) =>
        prev.map((ex) =>
          ex.id === editingExpense.id
            ? { ...ex, category: editExpenseCategory, amount: amt, note: editExpenseNote }
            : ex
        )
      )
      setEditingExpense(null)
      toast.success('Expense updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update expense')
    } finally {
      setIsSaving(false)
    }
  }

  const openEditBudget = (budget: SharedBudget) => {
    setEditingBudget(budget)
    setEditBudgetAmount(String(budget.amount))
  }

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBudget) return
    const amt = parseFloat(editBudgetAmount)
    if (!amt || amt <= 0) return
    setIsSaving(true)
    try {
      await updateSharedBudget(editingBudget.id, amt)
      setBudgets((prev) =>
        prev.map((b) => (b.id === editingBudget.id ? { ...b, amount: amt } : b))
      )
      setEditingBudget(null)
      toast.success('Budget updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update budget')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Member handlers ─────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setIsSaving(true)
    try {
      const member = await inviteMember(groupId, inviteEmail, inviteCanEdit, inviteCanInvite)
      setMembers((prev) => [...prev, member])
      setShowInvite(false)
      setInviteEmail('')
      setInviteCanEdit(false)
      setInviteCanInvite(false)
      toast.success('Member added!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to invite member')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveMember = async (member: SharedGroupMember) => {
    try {
      await removeMember(member.id)
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      toast.success('Member removed')
    } catch {
      toast.error('Failed to remove member')
    }
  }

  const handleUpdatePermissions = async (
    memberId: string,
    canEditBudget: boolean,
    canInviteMembers: boolean
  ) => {
    try {
      await updateMemberPermissions(memberId, canEditBudget, canInviteMembers)
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, can_edit_budget: canEditBudget, can_invite_members: canInviteMembers }
            : m
        )
      )
    } catch {
      toast.error('Failed to update permissions')
    }
  }

  const handleLeave = async () => {
    try {
      await leaveGroup(groupId)
      toast.success('You left the group')
      router.push('/shared')
    } catch {
      toast.error('Failed to leave group')
    }
  }

  const handleDeleteGroup = async () => {
    try {
      await deleteSharedGroup(groupId)
      toast.success('Group deleted')
      router.push('/shared')
    } catch {
      toast.error('Failed to delete group')
    }
  }

  // ── Permission request handlers ─────────────────────────────
  const handleApproveRequest = async (requestId: string) => {
    try {
      await approvePermissionRequest(requestId)
      const req = requests.find((r) => r.id === requestId)
      if (req) {
        setMembers((prev) =>
          prev.map((m) => {
            if (m.user_id !== req.user_id) return m
            return req.type === 'edit_access'
              ? { ...m, can_edit_budget: true }
              : { ...m, can_invite_members: true }
          })
        )
      }
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
      toast.success('Permission granted')
    } catch {
      toast.error('Failed to approve request')
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectPermissionRequest(requestId)
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
      toast.success('Request rejected')
    } catch {
      toast.error('Failed to reject request')
    }
  }

  const handleCreateRequest = async (type: 'edit_access' | 'invite_permission') => {
    try {
      const req = await createPermissionRequest(groupId, type)
      setRequests((prev) => [...prev, req])
      toast.success('Request sent to the group owner')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send request')
    }
  }

  // ── Add Expense form ─────────────────────────────────────────
  const expenseForm = (
    <form onSubmit={handleAddExpense} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Category</Label>
        <Select value={expenseCategory} onValueChange={(v: string | null) => v && setExpenseCategory(v)}>
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEFAULT_CATEGORIES.map((cat) => (
              <SelectItem key={cat.name} value={cat.name}>{cat.icon} {cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Amount (₱)</Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
          <Input
            type="number"
            inputMode="decimal"
            min="1"
            placeholder="0"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            className="pl-8 h-12 text-lg font-semibold rounded-xl"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Note</Label>
        <Input
          placeholder="What's this for?"
          value={expenseNote}
          onChange={(e) => setExpenseNote(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
          onClick={() => setShowAddExpense(false)}>Cancel</Button>
        <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving}>
          {isSaving ? 'Adding...' : 'Add Expense'}
        </Button>
      </div>
    </form>
  )

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (!group) return null

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/shared')}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-accent transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{group.emoji}</span>
            <div>
              <h1 className="text-xl font-bold leading-tight">{group.name}</h1>
              <p className="text-xs text-muted-foreground">
                {members.length + 1} member{members.length + 1 !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center w-9 h-9 rounded-xl hover:bg-accent transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {myPerms.canEditBudget && (
              <DropdownMenuItem onClick={() => setShowAddBudget(true)}>
                <Target className="mr-2 h-3.5 w-3.5" />
                Add budget
              </DropdownMenuItem>
            )}
            {!isOwner && (
              <DropdownMenuItem onClick={handleLeave} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Leave group
              </DropdownMenuItem>
            )}
            {myPerms.canManagePermissions && (
              <DropdownMenuItem onClick={handleDeleteGroup} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete group
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Budget', value: formatCurrency(totalBudget), color: 'text-foreground' },
          { label: 'Total Spent', value: formatCurrency(totalSpent), color: 'text-rose-600 dark:text-rose-400' },
          {
            label: 'Remaining',
            value: formatCurrency(Math.abs(totalRemaining)),
            color: totalRemaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-3 text-center">
            <p className={`text-base font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(['overview', 'chat'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 h-8 rounded-lg text-sm font-medium transition-colors capitalize',
              activeTab === tab
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'chat' ? '💬 Chat' : 'Overview'}
          </button>
        ))}
      </div>

      {activeTab === 'chat' && (
        <GroupChat groupId={groupId} currentUserId={currentUserId} />
      )}

      {activeTab === 'overview' && (
      <>

      {/* ── Members & Roles ── */}
      <MembersSection
        ownerEmail={ownerEmail}
        members={members}
        requests={requests}
        currentUserId={currentUserId}
        currentUserEmail={currentUserEmail}
        myPerms={myPerms}
        isOwner={isOwner}
        onInvite={() => setShowInvite(true)}
        onUpdatePermissions={handleUpdatePermissions}
        onRemoveMember={handleRemoveMember}
        onApproveRequest={handleApproveRequest}
        onRejectRequest={handleRejectRequest}
        onCreateRequest={handleCreateRequest}
      />

      {/* ── Category Budgets ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Category Budgets</h2>
          {myPerms.canEditBudget && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-xl text-xs gap-1.5"
              onClick={() => setShowAddBudget(true)}
              disabled={availableBudgetCategories.length === 0}
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
          )}
        </div>

        {budgets.length === 0 ? (
          <div className="text-center py-10 rounded-2xl border border-dashed border-border">
            <Target className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {myPerms.canEditBudget
                ? 'No budgets yet — add one to start tracking.'
                : 'No budgets set yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {budgets.map((budget) => (
              <SharedBudgetProgress
                key={budget.id}
                budget={budget}
                expenses={expenses}
                canDelete={myPerms.canEditBudget}
                onEdit={openEditBudget}
                onDelete={handleDeleteBudget}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Shared Expenses ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Expenses</h2>
          <p className="text-xs text-muted-foreground">{expenses.length} total</p>
        </div>

        {expenses.length === 0 ? (
          <div className="text-center py-10 rounded-2xl border border-dashed border-border">
            <Users className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No shared expenses yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {expenses.map((exp) => (
              <SharedExpenseItem
                key={exp.id}
                expense={exp}
                currentUserId={currentUserId}
                isOwner={isOwner}
                canEditBudget={myPerms.canEditBudget}
                onEdit={openEditExpense}
                onDelete={handleDeleteExpense}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Add Expense FAB ── */}
      <Button
        type="button"
        onClick={() => setShowAddExpense(true)}
        size="lg"
        className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 z-50 h-14 w-14 rounded-full shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:scale-110 p-0"
      >
        <Plus className="h-6 w-6" />
        <span className="sr-only">Add shared expense</span>
      </Button>

      </> /* end overview tab */
      )}

      {/* ── Add Expense — mobile sheet / desktop dialog ── */}
      {isMobile ? (
        <BottomSheet open={showAddExpense} onClose={() => setShowAddExpense(false)} title="Add Expense">
          {expenseForm}
        </BottomSheet>
      ) : (
        <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
          <DialogContent className="sm:max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Add Expense</DialogTitle>
            </DialogHeader>
            {expenseForm}
          </DialogContent>
        </Dialog>
      )}

      {/* ── Add Budget dialog ── */}
      <Dialog open={showAddBudget} onOpenChange={setShowAddBudget}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Set Budget</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddBudget} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Category</Label>
              <Select
                value={budgetCategory}
                onValueChange={(v: string | null) => v && setBudgetCategory(v)}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {(availableBudgetCategories.length > 0 ? availableBudgetCategories : DEFAULT_CATEGORIES).map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>{cat.icon} {cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Budget Amount (₱)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  placeholder="0"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  className="pl-8 h-12 text-lg font-semibold rounded-xl"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
                onClick={() => setShowAddBudget(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Set Budget'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Expense dialog ── */}
      <Dialog open={!!editingExpense} onOpenChange={(o) => !o && setEditingExpense(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveExpense} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Category</Label>
              <Select value={editExpenseCategory} onValueChange={(v: string | null) => v && setEditExpenseCategory(v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>{cat.icon} {cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Amount (₱)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  placeholder="0"
                  value={editExpenseAmount}
                  onChange={(e) => setEditExpenseAmount(e.target.value)}
                  className="pl-8 h-12 text-lg font-semibold rounded-xl"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Note</Label>
              <Input
                placeholder="What's this for?"
                value={editExpenseNote}
                onChange={(e) => setEditExpenseNote(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
                onClick={() => setEditingExpense(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Budget dialog ── */}
      <Dialog open={!!editingBudget} onOpenChange={(o) => !o && setEditingBudget(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Edit Budget — {editingBudget?.category}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveBudget} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Budget Amount (₱)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  placeholder="0"
                  value={editBudgetAmount}
                  onChange={(e) => setEditBudgetAmount(e.target.value)}
                  className="pl-8 h-12 text-lg font-semibold rounded-xl"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
                onClick={() => setEditingBudget(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Invite member dialog ── */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Invite Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Email address</Label>
              <Input
                type="email"
                placeholder="friend@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-11 rounded-xl"
                required
              />
              <p className="text-xs text-muted-foreground">
                The person must already have a Budget Journal account.
              </p>
            </div>
            {isOwner && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Permissions</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteCanEdit((v) => !v)}
                    className={cn(
                      'flex-1 h-10 rounded-xl text-sm font-medium border transition-colors',
                      inviteCanEdit
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Edit Budget
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteCanInvite((v) => !v)}
                    className={cn(
                      'flex-1 h-10 rounded-xl text-sm font-medium border transition-colors',
                      inviteCanInvite
                        ? 'bg-violet-500 text-white border-violet-500'
                        : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Invite Members
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Toggle permissions to grant on invite. Members can always add expenses.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
                onClick={() => setShowInvite(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving}>
                {isSaving ? 'Inviting...' : 'Add Member'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
