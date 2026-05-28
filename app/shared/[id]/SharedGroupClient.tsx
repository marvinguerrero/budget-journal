'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  SharedGroup, SharedGroupMember, SharedBudget, SharedExpense,
  SharedExpenseSplit, SharedExpenseSettlement, PermissionRequest, SplitMode,
} from '@/types'
import {
  getSharedGroupDetails, inviteMember, removeMember, leaveGroup,
  deleteSharedGroup, updateMemberPermissions,
} from '@/services/sharedGroups'
import { createSharedBudget, updateSharedBudget, deleteSharedBudget } from '@/services/sharedBudgets'
import {
  createSharedExpense, updateSharedExpense, deleteSharedExpense, SplitInput,
} from '@/services/sharedExpenses'
import {
  createSettlement, confirmSettlement, rejectSettlement,
} from '@/services/settlements'
import {
  createPermissionRequest, approvePermissionRequest, rejectPermissionRequest,
} from '@/services/permissionRequests'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { MemberCapabilities, resolveCapabilities } from '@/lib/permissions'
import { MembersSection } from '@/components/shared/MembersSection'
import { SharedBudgetProgress } from '@/components/shared/SharedBudgetProgress'
import { SharedExpenseItem } from '@/components/shared/SharedExpenseItem'
import { BalanceSummary, NetBalance } from '@/components/shared/BalanceSummary'
import { GroupChat } from '@/components/shared/GroupChat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BottomSheet } from '@/components/common/BottomSheet'
import { useIsMobile } from '@/hooks/useIsMobile'
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { formatCurrency, formatShortDate } from '@/utils/format'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, Plus, MoreHorizontal, Trash2, LogOut, Target, Users,
  CheckCircle2, XCircle, Clock, Wallet,
} from 'lucide-react'

interface Props {
  groupId: string
  currentUserId: string
  currentUserEmail: string
}

interface Participant { user_id: string; email: string }

// ── helpers ──────────────────────────────────────────────────────────────────

function shortName(userId: string, email: string, currentUserId: string) {
  return userId === currentUserId ? 'You' : email.split('@')[0]
}

// ── module-level sub-components (must NOT be nested inside SharedGroupClient) ─
// Defining them inside the parent causes remount on every keystroke because
// React sees a new component type each render, resetting input focus/value.

interface PaidBySelectorProps {
  participants: Participant[]
  currentUserId: string
  value: string
  onChange: (id: string) => void
  onEmailChange: (email: string) => void
}

function PaidBySelector({ participants, currentUserId, value, onChange, onEmailChange }: PaidBySelectorProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Who paid?</Label>
      <div className="flex flex-wrap gap-1.5">
        {participants.map((p) => (
          <button
            key={p.user_id}
            type="button"
            onClick={() => { onChange(p.user_id); onEmailChange(p.email) }}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              value === p.user_id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
            )}
          >
            {shortName(p.user_id, p.email, currentUserId)}
          </button>
        ))}
      </div>
    </div>
  )
}

interface SplitSectionProps {
  participants: Participant[]
  currentUserId: string
  mode: SplitMode
  setMode: (m: SplitMode) => void
  included: Record<string, boolean>
  setIncluded: (v: Record<string, boolean>) => void
  customAmts: Record<string, string>
  setCustomAmts: (v: Record<string, string>) => void
  totalAmt: number
}

function SplitSection({
  participants, currentUserId, mode, setMode, included, setIncluded,
  customAmts, setCustomAmts, totalAmt,
}: SplitSectionProps) {
  const active      = participants.filter((p) => included[p.user_id] !== false)
  const equalShare  = active.length > 0 ? totalAmt / active.length : 0
  const customTotal = participants.reduce((s, p) => s + (parseFloat(customAmts[p.user_id] || '0') || 0), 0)
  const customValid = totalAmt > 0 && Math.abs(customTotal - totalAmt) <= 0.01

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <Label className="text-sm font-semibold">Split</Label>
        <div className="flex gap-1 p-0.5 rounded-lg bg-muted ml-auto">
          {(['equal', 'custom'] as SplitMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize',
                mode === m
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'equal' ? '⚖️ Equal' : '✏️ Custom'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'equal' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {participants.map((p) => {
              const on = included[p.user_id] !== false
              return (
                <button
                  key={p.user_id}
                  type="button"
                  onClick={() => setIncluded({ ...included, [p.user_id]: !on })}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    on
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/50 text-muted-foreground'
                  )}
                >
                  {shortName(p.user_id, p.email, currentUserId)}
                </button>
              )
            })}
          </div>
          {active.length > 0 && totalAmt > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(equalShare)} each · {active.length} {active.length === 1 ? 'person' : 'people'}
            </p>
          )}
        </div>
      )}

      {mode === 'custom' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Enter each person's share</span>
            <span className={cn(
              'font-semibold tabular-nums',
              customValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            )}>
              {formatCurrency(customTotal)} / {formatCurrency(totalAmt)}
            </span>
          </div>
          <div className="space-y-1.5">
            {participants.map((p) => (
              <div key={p.user_id} className="flex items-center gap-2">
                <span className="text-sm w-20 truncate flex-shrink-0 text-foreground">
                  {shortName(p.user_id, p.email, currentUserId)}
                </span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₱</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={customAmts[p.user_id] ?? ''}
                    onChange={(e) => setCustomAmts({ ...customAmts, [p.user_id]: e.target.value })}
                    className="pl-7 h-9 rounded-lg text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
          {!customValid && totalAmt > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Remaining: {formatCurrency(totalAmt - customTotal)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function computeSplits(
  mode: SplitMode,
  participants: Participant[],
  included: Record<string, boolean>,
  customAmounts: Record<string, string>,
  totalAmount: number,
): SplitInput[] {
  if (mode === 'equal') {
    const active = participants.filter((p) => included[p.user_id] !== false)
    if (active.length === 0) return []
    const share = totalAmount / active.length
    return active.map((p) => ({ user_id: p.user_id, email: p.email, amount: parseFloat(share.toFixed(2)) }))
  }
  return participants
    .map((p) => ({ user_id: p.user_id, email: p.email, amount: parseFloat(customAmounts[p.user_id] || '0') || 0 }))
    .filter((s) => s.amount > 0)
}

// ── main component ────────────────────────────────────────────────────────────

export function SharedGroupClient({ groupId, currentUserId, currentUserEmail }: Props) {
  const router   = useRouter()
  const isMobile = useIsMobile()

  // ── core data ──────────────────────────────────────────────────
  const [group, setGroup]             = useState<SharedGroup | null>(null)
  const [ownerEmail, setOwnerEmail]   = useState('')
  const [members, setMembers]         = useState<SharedGroupMember[]>([])
  const [budgets, setBudgets]         = useState<SharedBudget[]>([])
  const [expenses, setExpenses]       = useState<SharedExpense[]>([])
  const [splits, setSplits]           = useState<SharedExpenseSplit[]>([])
  const [settlements, setSettlements] = useState<SharedExpenseSettlement[]>([])
  const [requests, setRequests]       = useState<PermissionRequest[]>([])
  const [isLoading, setIsLoading]     = useState(true)

  const { accounts } = useFinancialAccounts()

  // ── Settle dialog state ────────────────────────────────────────
  const [settlingBalance,  setSettlingBalance]  = useState<NetBalance | null>(null)
  const [settleAccountId,  setSettleAccountId]  = useState('')
  const [settleNote,       setSettleNote]       = useState('')
  const [isSavingSettle,   setIsSavingSettle]   = useState(false)

  // ── Confirm/Reject dialog state ────────────────────────────────
  const [confirmingSettlement,   setConfirmingSettlement]   = useState<SharedExpenseSettlement | null>(null)
  const [confirmAccountId,       setConfirmAccountId]       = useState('')
  const [isSavingConfirm,        setIsSavingConfirm]        = useState(false)

  // ── UI state ───────────────────────────────────────────────────
  const [activeTab, setActiveTab]     = useState<'overview' | 'chat'>('overview')
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showAddBudget,  setShowAddBudget]  = useState(false)
  const [showInvite,     setShowInvite]     = useState(false)

  // ── Add expense form ───────────────────────────────────────────
  const [expenseCategory,    setExpenseCategory]    = useState(DEFAULT_CATEGORIES[0].name)
  const [expenseAmount,      setExpenseAmount]      = useState('')
  const [expenseNote,        setExpenseNote]        = useState('')
  const [expensePaidById,    setExpensePaidById]    = useState(currentUserId)
  const [expensePaidByEmail, setExpensePaidByEmail] = useState(currentUserEmail)
  const [expenseSplitMode,   setExpenseSplitMode]   = useState<SplitMode>('equal')
  const [expenseIncluded,    setExpenseIncluded]    = useState<Record<string, boolean>>({})
  const [expenseCustomAmts,  setExpenseCustomAmts]  = useState<Record<string, string>>({})

  // ── Edit expense form ──────────────────────────────────────────
  const [editingExpense,         setEditingExpense]         = useState<SharedExpense | null>(null)
  const [editExpenseCategory,    setEditExpenseCategory]    = useState('')
  const [editExpenseAmount,      setEditExpenseAmount]      = useState('')
  const [editExpenseNote,        setEditExpenseNote]        = useState('')
  const [editExpensePaidById,    setEditExpensePaidById]    = useState(currentUserId)
  const [editExpensePaidByEmail, setEditExpensePaidByEmail] = useState(currentUserEmail)
  const [editExpenseSplitMode,   setEditExpenseSplitMode]   = useState<SplitMode>('equal')
  const [editExpenseIncluded,    setEditExpenseIncluded]    = useState<Record<string, boolean>>({})
  const [editExpenseCustomAmts,  setEditExpenseCustomAmts]  = useState<Record<string, string>>({})

  // ── Budget form ────────────────────────────────────────────────
  const [budgetCategory, setBudgetCategory] = useState('')
  const [budgetAmount,   setBudgetAmount]   = useState('')
  const [editingBudget,  setEditingBudget]  = useState<SharedBudget | null>(null)
  const [editBudgetAmount, setEditBudgetAmount] = useState('')

  // ── Invite form ────────────────────────────────────────────────
  const [inviteEmail,     setInviteEmail]     = useState('')
  const [inviteCanEdit,   setInviteCanEdit]   = useState(false)
  const [inviteCanInvite, setInviteCanInvite] = useState(false)

  const [isSaving, setIsSaving] = useState(false)

  // ── derived ────────────────────────────────────────────────────
  const isOwner = group?.owner_id === currentUserId

  const myPerms: MemberCapabilities = useMemo(() => {
    const myMember = members.find((m) => m.user_id === currentUserId)
    return resolveCapabilities(isOwner, myMember)
  }, [isOwner, members, currentUserId])

  const allParticipants: Participant[] = useMemo(() => {
    if (!group) return []
    return [
      { user_id: group.owner_id, email: ownerEmail },
      ...members.map((m) => ({ user_id: m.user_id, email: m.email })),
    ]
  }, [group, ownerEmail, members])

  const splitsByExpense = useMemo(() => {
    const map = new Map<string, SharedExpenseSplit[]>()
    for (const s of splits) {
      const arr = map.get(s.expense_id) ?? []
      arr.push(s)
      map.set(s.expense_id, arr)
    }
    return map
  }, [splits])

  const netBalances = useMemo((): NetBalance[] => {
    const net: Record<string, Record<string, number>> = {}
    const emailFor: Record<string, string> = {}

    for (const exp of expenses) {
      const creditorId    = exp.paid_by_user_id ?? exp.user_id
      const creditorEmail = exp.paid_by_email   || exp.user_email
      emailFor[creditorId] = creditorEmail

      for (const s of splitsByExpense.get(exp.id) ?? []) {
        if (s.debtor_user_id === creditorId) continue
        emailFor[s.debtor_user_id] = s.debtor_email
        if (!net[s.debtor_user_id]) net[s.debtor_user_id] = {}
        net[s.debtor_user_id][creditorId] = (net[s.debtor_user_id][creditorId] ?? 0) + s.amount
      }
    }

    // Subtract confirmed settlements so they no longer show as outstanding debt
    for (const st of settlements) {
      if (st.status !== 'confirmed') continue
      const d = st.payer_user_id
      const c = st.receiver_user_id
      if (net[d]?.[c] !== undefined) {
        net[d][c] = Math.max(0, net[d][c] - st.amount)
      }
    }

    const result: NetBalance[] = []
    const done = new Set<string>()

    for (const debtorId of Object.keys(net)) {
      for (const creditorId of Object.keys(net[debtorId])) {
        const key = [debtorId, creditorId].sort().join('|')
        if (done.has(key)) continue
        done.add(key)

        const aOwesB = net[debtorId]?.[creditorId] ?? 0
        const bOwesA = net[creditorId]?.[debtorId] ?? 0
        const netAmt = aOwesB - bOwesA

        if (netAmt > 0.005) {
          result.push({ debtorId, debtorEmail: emailFor[debtorId], creditorId, creditorEmail: emailFor[creditorId], amount: netAmt })
        } else if (netAmt < -0.005) {
          result.push({ debtorId: creditorId, debtorEmail: emailFor[creditorId], creditorId: debtorId, creditorEmail: emailFor[debtorId], amount: -netAmt })
        }
      }
    }

    return result.sort((a, b) => b.amount - a.amount)
  }, [expenses, splitsByExpense, settlements])

  const totalBudget    = useMemo(() => budgets.reduce((s, b) => s + b.amount, 0), [budgets])
  const totalSpent     = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses])
  const totalRemaining = totalBudget - totalSpent

  const coveredCategories        = new Set(budgets.map((b) => b.category))
  const availableBudgetCategories = DEFAULT_CATEGORIES.filter((c) => !coveredCategories.has(c.name))

  // ── load ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const details = await getSharedGroupDetails(groupId)
      setGroup(details.group)
      setOwnerEmail(details.ownerEmail)
      setMembers(details.members)
      setBudgets(details.budgets)
      setExpenses(details.expenses)
      setSplits(details.splits)
      setSettlements(details.settlements)
      setRequests(details.requests)
    } catch {
      toast.error('Failed to load group')
      router.push('/shared')
    } finally {
      setIsLoading(false)
    }
  }, [groupId, router])

  useEffect(() => { load() }, [load])

  // ── expense handlers ───────────────────────────────────────────
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(expenseAmount)
    if (!amt || amt <= 0) return

    if (expenseSplitMode === 'custom') {
      const total = allParticipants.reduce((s, p) => s + (parseFloat(expenseCustomAmts[p.user_id] || '0') || 0), 0)
      if (Math.abs(total - amt) > 0.01) {
        toast.error(`Custom split total (${formatCurrency(total)}) must equal expense amount (${formatCurrency(amt)})`)
        return
      }
    }

    setIsSaving(true)
    try {
      const computedSplits = computeSplits(expenseSplitMode, allParticipants, expenseIncluded, expenseCustomAmts, amt)
      const { expense, splits: newSplits } = await createSharedExpense(
        groupId, expenseCategory, amt, expenseNote,
        expensePaidById, expensePaidByEmail, expenseSplitMode, computedSplits,
      )
      setExpenses((prev) => [expense, ...prev])
      setSplits((prev) => [...prev, ...newSplits])
      setShowAddExpense(false)
      resetAddForm()
      toast.success('Expense added!')
    } catch {
      toast.error('Failed to add expense')
    } finally {
      setIsSaving(false)
    }
  }

  const resetAddForm = () => {
    setExpenseAmount('')
    setExpenseNote('')
    setExpensePaidById(currentUserId)
    setExpensePaidByEmail(currentUserEmail)
    setExpenseSplitMode('equal')
    setExpenseIncluded({})
    setExpenseCustomAmts({})
  }

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteSharedExpense(id)
      setExpenses((prev) => prev.filter((e) => e.id !== id))
      setSplits((prev) => prev.filter((s) => s.expense_id !== id))
      toast.success('Expense deleted')
    } catch {
      toast.error('Failed to delete expense')
    }
  }

  const openEditExpense = (expense: SharedExpense) => {
    setEditingExpense(expense)
    setEditExpenseCategory(expense.category)
    setEditExpenseAmount(String(expense.amount))
    setEditExpenseNote(expense.note)

    const payerId = expense.paid_by_user_id ?? expense.user_id
    setEditExpensePaidById(payerId)
    setEditExpensePaidByEmail(expense.paid_by_email || expense.user_email)
    setEditExpenseSplitMode(expense.split_mode ?? 'equal')

    const expSplits = splitsByExpense.get(expense.id) ?? []
    if (expense.split_mode === 'custom' && expSplits.length > 0) {
      setEditExpenseCustomAmts(Object.fromEntries(expSplits.map((s) => [s.debtor_user_id, String(s.amount)])))
      setEditExpenseIncluded({})
    } else if (expSplits.length > 0) {
      const ids = new Set(expSplits.map((s) => s.debtor_user_id))
      setEditExpenseIncluded(Object.fromEntries(allParticipants.map((p) => [p.user_id, ids.has(p.user_id)])))
      setEditExpenseCustomAmts({})
    } else {
      setEditExpenseIncluded({})
      setEditExpenseCustomAmts({})
    }
  }

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingExpense) return
    const amt = parseFloat(editExpenseAmount)
    if (!amt || amt <= 0) return

    if (editExpenseSplitMode === 'custom') {
      const total = allParticipants.reduce((s, p) => s + (parseFloat(editExpenseCustomAmts[p.user_id] || '0') || 0), 0)
      if (Math.abs(total - amt) > 0.01) {
        toast.error(`Custom split total (${formatCurrency(total)}) must equal expense amount (${formatCurrency(amt)})`)
        return
      }
    }

    setIsSaving(true)
    try {
      const computedSplits = computeSplits(editExpenseSplitMode, allParticipants, editExpenseIncluded, editExpenseCustomAmts, amt)
      const newSplits = await updateSharedExpense(
        editingExpense.id, editExpenseCategory, amt, editExpenseNote,
        editExpensePaidById, editExpensePaidByEmail, editExpenseSplitMode, computedSplits,
      )
      setExpenses((prev) =>
        prev.map((ex) =>
          ex.id === editingExpense.id
            ? { ...ex, category: editExpenseCategory, amount: amt, note: editExpenseNote,
                paid_by_user_id: editExpensePaidById, paid_by_email: editExpensePaidByEmail,
                split_mode: editExpenseSplitMode }
            : ex
        )
      )
      setSplits((prev) => [...prev.filter((s) => s.expense_id !== editingExpense.id), ...newSplits])
      setEditingExpense(null)
      toast.success('Expense updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update expense')
    } finally {
      setIsSaving(false)
    }
  }

  // ── budget handlers ────────────────────────────────────────────
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
      setBudgets((prev) => prev.map((b) => (b.id === editingBudget.id ? { ...b, amount: amt } : b)))
      setEditingBudget(null)
      toast.success('Budget updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update budget')
    } finally {
      setIsSaving(false)
    }
  }

  // ── member handlers ────────────────────────────────────────────
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

  const handleUpdatePermissions = async (memberId: string, canEditBudget: boolean, canInviteMembers: boolean) => {
    try {
      await updateMemberPermissions(memberId, canEditBudget, canInviteMembers)
      setMembers((prev) =>
        prev.map((m) => m.id === memberId ? { ...m, can_edit_budget: canEditBudget, can_invite_members: canInviteMembers } : m)
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

  // ── settlement handlers ────────────────────────────────────────

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settlingBalance) return
    setIsSavingSettle(true)
    try {
      const s = await createSettlement({
        groupId,
        receiverUserId: settlingBalance.creditorId,
        receiverEmail:  settlingBalance.creditorEmail,
        amount:         settlingBalance.amount,
        payerAccountId: settleAccountId || null,
        note:           settleNote,
      })
      setSettlements((prev) => [s, ...prev])
      setSettlingBalance(null)
      setSettleAccountId('')
      setSettleNote('')
      toast.success('Payment sent — waiting for confirmation')
    } catch {
      toast.error('Failed to send settlement')
    } finally {
      setIsSavingSettle(false)
    }
  }

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmingSettlement) return
    setIsSavingConfirm(true)
    try {
      await confirmSettlement(confirmingSettlement.id, confirmAccountId || null)
      setSettlements((prev) =>
        prev.map((s) => s.id === confirmingSettlement.id
          ? { ...s, status: 'confirmed' as const, confirmed_at: new Date().toISOString(), receiver_account_id: confirmAccountId || null }
          : s)
      )
      setConfirmingSettlement(null)
      setConfirmAccountId('')
      toast.success('Payment confirmed!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm')
    } finally {
      setIsSavingConfirm(false)
    }
  }

  const handleRejectSettlement = async (id: string) => {
    try {
      await rejectSettlement(id)
      setSettlements((prev) =>
        prev.map((s) => s.id === id ? { ...s, status: 'rejected' as const } : s)
      )
      toast.success('Payment rejected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    }
  }

  // ── add expense form ───────────────────────────────────────────
  const addExpenseAmt = parseFloat(expenseAmount) || 0

  const isAddCustomValid = expenseSplitMode !== 'custom' || (() => {
    const t = allParticipants.reduce((s, p) => s + (parseFloat(expenseCustomAmts[p.user_id] || '0') || 0), 0)
    return Math.abs(t - addExpenseAmt) <= 0.01
  })()

  const expenseForm = (
    <form onSubmit={handleAddExpense} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Category</Label>
        <Select value={expenseCategory} onValueChange={(v: string | null) => v && setExpenseCategory(v)}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
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
            type="number" inputMode="decimal" min="1" placeholder="0"
            value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)}
            className="pl-8 h-12 text-lg font-semibold rounded-xl" required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Note</Label>
        <Input
          placeholder="What's this for?"
          value={expenseNote} onChange={(e) => setExpenseNote(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>

      {allParticipants.length > 0 && (
        <>
          <PaidBySelector
            participants={allParticipants}
            currentUserId={currentUserId}
            value={expensePaidById}
            onChange={setExpensePaidById}
            onEmailChange={setExpensePaidByEmail}
          />
          <SplitSection
            participants={allParticipants}
            currentUserId={currentUserId}
            mode={expenseSplitMode}
            setMode={setExpenseSplitMode}
            included={expenseIncluded}
            setIncluded={setExpenseIncluded}
            customAmts={expenseCustomAmts}
            setCustomAmts={setExpenseCustomAmts}
            totalAmt={addExpenseAmt}
          />
        </>
      )}

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
          onClick={() => { setShowAddExpense(false); resetAddForm() }}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 h-11 rounded-xl font-semibold"
          disabled={isSaving || !isAddCustomValid}
        >
          {isSaving ? 'Adding…' : 'Add Expense'}
        </Button>
      </div>
    </form>
  )

  // ── loading skeleton ───────────────────────────────────────────
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

  const editExpenseAmt    = parseFloat(editExpenseAmount) || 0
  const isEditCustomValid = editExpenseSplitMode !== 'custom' || (() => {
    const t = allParticipants.reduce((s, p) => s + (parseFloat(editExpenseCustomAmts[p.user_id] || '0') || 0), 0)
    return Math.abs(t - editExpenseAmt) <= 0.01
  })()

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
          { label: 'Total Spent',  value: formatCurrency(totalSpent),  color: 'text-rose-600 dark:text-rose-400' },
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
            key={tab} type="button" onClick={() => setActiveTab(tab)}
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
                  type="button" size="sm" variant="outline"
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
                  {myPerms.canEditBudget ? 'No budgets yet — add one to start tracking.' : 'No budgets set yet.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {budgets.map((budget) => (
                  <SharedBudgetProgress
                    key={budget.id} budget={budget} expenses={expenses}
                    canDelete={myPerms.canEditBudget}
                    onEdit={openEditBudget} onDelete={handleDeleteBudget}
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
                    splits={splitsByExpense.get(exp.id) ?? []}
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

          {/* ── Balances ── */}
          <BalanceSummary
            balances={netBalances}
            currentUserId={currentUserId}
            onSettle={setSettlingBalance}
          />

          {/* ── Pending Confirmations (receiver) ── */}
          {settlements.some((s) => s.receiver_user_id === currentUserId && s.status === 'pending_confirmation') && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Pending Confirmations</p>
              </div>
              <div className="space-y-2">
                {settlements
                  .filter((s) => s.receiver_user_id === currentUserId && s.status === 'pending_confirmation')
                  .map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {s.payer_email.split('@')[0]} paid you
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.note || 'Settlement payment'}
                        </p>
                      </div>
                      <span className="font-bold tabular-nums text-sm text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                        +{formatCurrency(s.amount)}
                      </span>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmingSettlement(s)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectSettlement(s.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ── Settlement History ── */}
          {settlements.filter((s) => s.payer_user_id === currentUserId || s.receiver_user_id === currentUserId).length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold">Settlement History</p>
              <div className="space-y-2">
                {settlements
                  .filter((s) => s.payer_user_id === currentUserId || s.receiver_user_id === currentUserId)
                  .map((s) => {
                    const isSender = s.payer_user_id === currentUserId
                    const counterEmail = isSender ? s.receiver_email : s.payer_email
                    const counterName  = counterEmail.split('@')[0]

                    const statusIcon  = s.status === 'confirmed'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      : s.status === 'rejected'
                        ? <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                        : <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />

                    const statusLabel = s.status === 'confirmed'
                      ? (isSender ? `${counterName} confirmed` : 'Confirmed')
                      : s.status === 'rejected'
                        ? 'Rejected'
                        : 'Pending confirmation'

                    return (
                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-accent/40">
                        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-base flex-shrink-0">
                          {isSender ? '💸' : '💰'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {isSender ? `Paid ${counterName}` : `Received from ${counterName}`}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {statusIcon}
                            <span className="text-xs text-muted-foreground">{statusLabel}</span>
                          </div>
                        </div>
                        <span className={`font-bold tabular-nums text-sm flex-shrink-0 ${
                          s.status === 'rejected' ? 'text-muted-foreground line-through' :
                          isSender ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {isSender ? '-' : '+'}{formatCurrency(s.amount)}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

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
        </>
      )}

      {/* ── Add Expense — mobile sheet / desktop dialog ── */}
      {isMobile ? (
        <BottomSheet open={showAddExpense} onClose={() => { setShowAddExpense(false); resetAddForm() }} title="Add Expense">
          {expenseForm}
        </BottomSheet>
      ) : (
        <Dialog open={showAddExpense} onOpenChange={(o) => { if (!o) resetAddForm(); setShowAddExpense(o) }}>
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
              <Select value={budgetCategory} onValueChange={(v: string | null) => v && setBudgetCategory(v)}>
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
                  type="number" inputMode="decimal" min="1" placeholder="0"
                  value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)}
                  className="pl-8 h-12 text-lg font-semibold rounded-xl" required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setShowAddBudget(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving}>{isSaving ? 'Saving…' : 'Set Budget'}</Button>
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
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
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
                  type="number" inputMode="decimal" min="1" placeholder="0"
                  value={editExpenseAmount} onChange={(e) => setEditExpenseAmount(e.target.value)}
                  className="pl-8 h-12 text-lg font-semibold rounded-xl" required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Note</Label>
              <Input
                placeholder="What's this for?"
                value={editExpenseNote} onChange={(e) => setEditExpenseNote(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            {allParticipants.length > 0 && (
              <>
                <PaidBySelector
                  participants={allParticipants}
                  currentUserId={currentUserId}
                  value={editExpensePaidById}
                  onChange={setEditExpensePaidById}
                  onEmailChange={setEditExpensePaidByEmail}
                />
                <SplitSection
                  participants={allParticipants}
                  currentUserId={currentUserId}
                  mode={editExpenseSplitMode}
                  setMode={setEditExpenseSplitMode}
                  included={editExpenseIncluded}
                  setIncluded={setEditExpenseIncluded}
                  customAmts={editExpenseCustomAmts}
                  setCustomAmts={setEditExpenseCustomAmts}
                  totalAmt={editExpenseAmt}
                />
              </>
            )}

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setEditingExpense(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving || !isEditCustomValid}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Budget dialog ── */}
      <Dialog open={!!editingBudget} onOpenChange={(o) => !o && setEditingBudget(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Budget — {editingBudget?.category}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveBudget} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Budget Amount (₱)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input
                  type="number" inputMode="decimal" min="1" placeholder="0"
                  value={editBudgetAmount} onChange={(e) => setEditBudgetAmount(e.target.value)}
                  className="pl-8 h-12 text-lg font-semibold rounded-xl" required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setEditingBudget(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Changes'}</Button>
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
                type="email" placeholder="friend@example.com"
                value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                className="h-11 rounded-xl" required
              />
              <p className="text-xs text-muted-foreground">The person must already have a Budget Journal account.</p>
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
                      inviteCanEdit ? 'bg-blue-500 text-white border-blue-500' : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Edit Budget
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteCanInvite((v) => !v)}
                    className={cn(
                      'flex-1 h-10 rounded-xl text-sm font-medium border transition-colors',
                      inviteCanInvite ? 'bg-violet-500 text-white border-violet-500' : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Invite Members
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Members can always add expenses.</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setShowInvite(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving}>{isSaving ? 'Inviting…' : 'Add Member'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Settle dialog (payer initiates) ── */}
      <Dialog open={!!settlingBalance} onOpenChange={(o) => { if (!o) { setSettlingBalance(null); setSettleAccountId(''); setSettleNote('') } }}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Settle Payment</DialogTitle>
          </DialogHeader>
          {settlingBalance && (
            <form onSubmit={handleSettle} className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                <div>
                  <p className="text-xs text-muted-foreground">You owe</p>
                  <p className="text-sm font-semibold">{settlingBalance.creditorEmail.split('@')[0]}</p>
                </div>
                <span className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatCurrency(settlingBalance.amount)}
                </span>
              </div>

              {/* Account selector */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  Pay from account <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSettleAccountId('')}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                      !settleAccountId
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    No account
                  </button>
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSettleAccountId(acc.id)}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        settleAccountId === acc.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {acc.emoji} {acc.name}
                    </button>
                  ))}
                </div>
                {settleAccountId && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(settlingBalance.amount)} will be deducted from this account immediately.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  placeholder="e.g. GCash transfer"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
                  onClick={() => { setSettlingBalance(null); setSettleAccountId(''); setSettleNote('') }}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSavingSettle}>
                  {isSavingSettle ? 'Sending…' : 'Mark as Paid'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm receipt dialog (receiver confirms) ── */}
      <Dialog open={!!confirmingSettlement} onOpenChange={(o) => { if (!o) { setConfirmingSettlement(null); setConfirmAccountId('') } }}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Confirm Payment Received</DialogTitle>
          </DialogHeader>
          {confirmingSettlement && (
            <form onSubmit={handleConfirmSettlement} className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                <div>
                  <p className="text-xs text-muted-foreground">Payment from</p>
                  <p className="text-sm font-semibold">{confirmingSettlement.payer_email.split('@')[0]}</p>
                  {confirmingSettlement.note && (
                    <p className="text-xs text-muted-foreground mt-0.5">{confirmingSettlement.note}</p>
                  )}
                </div>
                <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  +{formatCurrency(confirmingSettlement.amount)}
                </span>
              </div>

              {/* Account selector */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  Add to account <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmAccountId('')}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                      !confirmAccountId
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Don't add
                  </button>
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setConfirmAccountId(acc.id)}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        confirmAccountId === acc.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {acc.emoji} {acc.name}
                    </button>
                  ))}
                </div>
                {confirmAccountId && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(confirmingSettlement.amount)} will be added to this account.
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11 rounded-xl border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => { handleRejectSettlement(confirmingSettlement.id); setConfirmingSettlement(null) }}
                >
                  Reject
                </Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700" disabled={isSavingConfirm}>
                  {isSavingConfirm ? 'Confirming…' : 'Confirm Received'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
