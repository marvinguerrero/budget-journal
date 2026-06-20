'use client'

import { useState, useMemo } from 'react'
import { IncomeEntry } from '@/types'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { useIncomeEntries } from '@/hooks/useIncomeEntries'
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts'
import { IncomeEntryItem } from '@/components/income/IncomeEntryItem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { BottomSheet } from '@/components/common/BottomSheet'
import { FilterCheckboxGroup } from '@/components/common/FilterCheckboxGroup'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/useIsMobile'
import { PRESET_COLORS, PRESET_EMOJIS_INCOME, isLiabilityType } from '@/lib/constants'
import { AccountSelector } from '@/components/accounts/AccountSelector'
import { formatCurrency, getMonthName } from '@/utils/format'
import { cn } from '@/lib/utils'
import { Plus, SlidersHorizontal } from 'lucide-react'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: getMonthName(i + 1),
}))
const YEARS = ['2024', '2025', '2026']

// ── Date filter: Preset Range / Custom Range / Month-Year — mutually exclusive ──
type DatePresetKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year'
type DateFilterMode = 'none' | 'preset' | 'custom' | 'monthYear'

interface DateFilterState {
  mode: DateFilterMode
  preset: DatePresetKey | null
  customFrom: string
  customTo: string
  month: string
  year: string
}

function emptyDateFilter(): DateFilterState {
  return { mode: 'none', preset: null, customFrom: '', customTo: '', month: 'all', year: 'all' }
}

function defaultDateFilter(): DateFilterState {
  const now = new Date()
  return { mode: 'monthYear', preset: null, customFrom: '', customTo: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) }
}

const DATE_PRESET_OPTIONS: Array<{ value: DatePresetKey; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
]

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0) }
function endOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) }

function computePresetRange(preset: DatePresetKey): { start: Date; end: Date } {
  const now = new Date()
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) }
    case 'yesterday': {
      const d = new Date(now); d.setDate(d.getDate() - 1)
      return { start: startOfDay(d), end: endOfDay(d) }
    }
    case 'this_week': {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay())
      return { start: startOfDay(start), end: endOfDay(now) }
    }
    case 'last_week': {
      const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - now.getDay())
      const start = new Date(thisWeekStart); start.setDate(thisWeekStart.getDate() - 7)
      const end = new Date(thisWeekStart); end.setDate(thisWeekStart.getDate() - 1)
      return { start: startOfDay(start), end: endOfDay(end) }
    }
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      return { start, end }
    }
    case 'this_year':
      return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) }
    case 'last_year':
      return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999) }
  }
}

function dateFilterLabel(filter: DateFilterState): string {
  if (filter.mode === 'preset' && filter.preset) {
    return DATE_PRESET_OPTIONS.find((o) => o.value === filter.preset)?.label ?? 'Custom'
  }
  if (filter.mode === 'custom') {
    if (filter.customFrom && filter.customTo) return `${filter.customFrom} – ${filter.customTo}`
    if (filter.customFrom) return `From ${filter.customFrom}`
    if (filter.customTo) return `Until ${filter.customTo}`
    return 'Custom Range'
  }
  if (filter.mode === 'monthYear') {
    const monthLabel = filter.month === 'all' ? 'All months' : getMonthName(Number(filter.month))
    const yearLabel = filter.year === 'all' ? '' : ` ${filter.year}`
    return `${monthLabel}${yearLabel}`
  }
  return 'All time'
}

function matchesDateFilter(receivedAt: string, filter: DateFilterState): boolean {
  const t = new Date(receivedAt).getTime()
  if (filter.mode === 'preset' && filter.preset) {
    const { start, end } = computePresetRange(filter.preset)
    return t >= start.getTime() && t <= end.getTime()
  }
  if (filter.mode === 'custom') {
    if (filter.customFrom && t < new Date(filter.customFrom + 'T00:00:00').getTime()) return false
    if (filter.customTo && t > new Date(filter.customTo + 'T23:59:59.999').getTime()) return false
    return true
  }
  if (filter.mode === 'monthYear') {
    const d = new Date(receivedAt)
    if (filter.month !== 'all' && d.getMonth() + 1 !== Number(filter.month)) return false
    if (filter.year !== 'all' && d.getFullYear() !== Number(filter.year)) return false
    return true
  }
  return true
}

interface IncomeFilters {
  sources: string[]
  accounts: string[]
  accountTypes: string[]
  incomeTypes: string[]
}

const EMPTY_INCOME_FILTERS: IncomeFilters = {
  sources: [],
  accounts: [],
  accountTypes: [],
  incomeTypes: [],
}

function countActiveIncomeFilters(filters: IncomeFilters): number {
  return Object.values(filters).reduce((sum, arr) => sum + arr.length, 0)
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'asset', label: '💰 Assets' },
  { value: 'liability', label: '💳 Liabilities' },
] as const

const INCOME_TYPE_OPTIONS = [
  { value: 'received', label: '✓ Received' },
  { value: 'expected', label: '⏳ Expected' },
] as const

export default function IncomePage() {
  const now = new Date()
  const [showAdd, setShowAdd]           = useState(false)
  const [showAddSource, setShowAddSource] = useState(false)
  const isMobile = useIsMobile()

  // ── Multi-select checkbox + date filters (deferred apply, mirrors Expenses) ──
  const [appliedFilters, setAppliedFilters] = useState<IncomeFilters>(EMPTY_INCOME_FILTERS)
  const [draftFilters, setDraftFilters]     = useState<IncomeFilters>(EMPTY_INCOME_FILTERS)
  const [appliedDateFilter, setAppliedDateFilter] = useState<DateFilterState>(defaultDateFilter)
  const [draftDateFilter, setDraftDateFilter]     = useState<DateFilterState>(defaultDateFilter)
  const [showFilters, setShowFilters]       = useState(false)

  const { sources, addSource, removeSource } = useIncomeSources()
  const { accounts } = useFinancialAccounts()
  // Flexible date filtering (presets/custom range/month-year) needs the full
  // history fetched once and filtered client-side — a single month/year pair
  // can no longer drive a server-side query.
  const { entries, isLoading, addEntry, editEntry, removeEntry, markReceived } = useIncomeEntries()

  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const openFilters = () => {
    setDraftFilters(appliedFilters)
    setDraftDateFilter(appliedDateFilter)
    setShowFilters(true)
  }

  const toggleDraftValue = (key: keyof IncomeFilters, value: string) => {
    setDraftFilters((prev) => {
      const current = prev[key]
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
      return { ...prev, [key]: next }
    })
  }

  const selectDatePreset = (preset: DatePresetKey) => {
    setDraftDateFilter({ mode: 'preset', preset, customFrom: '', customTo: '', month: 'all', year: 'all' })
  }
  const setDraftCustomFrom = (value: string) => {
    setDraftDateFilter((prev) => ({ ...prev, mode: 'custom', preset: null, month: 'all', year: 'all', customFrom: value }))
  }
  const setDraftCustomTo = (value: string) => {
    setDraftDateFilter((prev) => ({ ...prev, mode: 'custom', preset: null, month: 'all', year: 'all', customTo: value }))
  }
  const setDraftMonth = (value: string) => {
    setDraftDateFilter((prev) => ({ ...prev, mode: 'monthYear', preset: null, customFrom: '', customTo: '', month: value }))
  }
  const setDraftYear = (value: string) => {
    setDraftDateFilter((prev) => ({ ...prev, mode: 'monthYear', preset: null, customFrom: '', customTo: '', year: value }))
  }
  const clearDraftDateFilter = () => setDraftDateFilter(emptyDateFilter())

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters)
    setAppliedDateFilter(draftDateFilter)
    setShowFilters(false)
  }

  // "Clear All" clears the checkbox groups only — date filter is a separate concern.
  const handleClearDraftFilters = () => {
    setDraftFilters(EMPTY_INCOME_FILTERS)
  }

  // "Reset" clears everything in the draft, including the date filter.
  const handleResetDraftFilters = () => {
    setDraftFilters(EMPTY_INCOME_FILTERS)
    setDraftDateFilter(emptyDateFilter())
  }

  const activeFilterCount = useMemo(() =>
    countActiveIncomeFilters(appliedFilters) + (appliedDateFilter.mode !== 'none' ? 1 : 0),
    [appliedFilters, appliedDateFilter]
  )

  // ── Add entry form state ─────────────────────────────────────
  const [entrySourceId, setEntrySourceId] = useState('')
  const [entryAccountId, setEntryAccountId] = useState('')
  const [entryAmount, setEntryAmount]     = useState('')
  const [entryNote, setEntryNote]         = useState('')
  const [entryDate, setEntryDate]         = useState(now.toISOString().slice(0, 10))
  const [entryStatus, setEntryStatus]     = useState<'expected' | 'received'>('expected')
  const [isSaving, setIsSaving]           = useState(false)

  // ── Add source form state ────────────────────────────────────
  const [srcEmoji, setSrcEmoji] = useState('💰')
  const [srcName,  setSrcName]  = useState('')
  const [srcColor, setSrcColor] = useState('#10B981')

  // ── Edit entry form state ────────────────────────────────────
  const [editingEntry, setEditingEntry]   = useState<IncomeEntry | null>(null)
  const [editSourceId, setEditSourceId]   = useState('')
  const [editAccountId, setEditAccountId] = useState('')
  const [editAmount,   setEditAmount]     = useState('')
  const [editNote,     setEditNote]       = useState('')
  const [editDate,     setEditDate]       = useState('')

  // ── Stats ─────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    entries.filter((e) => {
      const matchesDate = matchesDateFilter(e.received_at, appliedDateFilter)

      const account = e.account_id ? accountMap.get(e.account_id) : null

      // Each group: empty selection = no filter applied (OR within the group).
      const matchesSource = appliedFilters.sources.length === 0
        || appliedFilters.sources.includes(e.income_source_id)
      const matchesAccount = appliedFilters.accounts.length === 0
        || appliedFilters.accounts.includes(e.account_id ?? '')
      const matchesAccountType = appliedFilters.accountTypes.length === 0
        || (!!account && appliedFilters.accountTypes.includes(isLiabilityType(account.type) ? 'liability' : 'asset'))
      const matchesIncomeType = appliedFilters.incomeTypes.length === 0
        || appliedFilters.incomeTypes.includes(e.status)

      // AND across groups.
      return matchesDate && matchesSource && matchesAccount && matchesAccountType && matchesIncomeType
    }),
    [entries, appliedDateFilter, appliedFilters, accountMap]
  )
  const totalReceived  = useMemo(() => filtered.filter((e) => e.status === 'received').reduce((s, e) => s + e.amount, 0), [filtered])
  const totalExpected  = useMemo(() => filtered.filter((e) => e.status === 'expected').reduce((s, e) => s + e.amount, 0), [filtered])
  const totalIncome = totalReceived + totalExpected
  const avgEntry    = filtered.length > 0 ? totalIncome / filtered.length : 0

  const breakdown = useMemo(() => {
    const totals = new Map<string, number>()
    for (const e of filtered) totals.set(e.income_source_id, (totals.get(e.income_source_id) ?? 0) + e.amount)
    return Array.from(totals.entries())
      .map(([id, amount]) => ({ id, source: sourceMap.get(id), amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [filtered, sourceMap])

  // ── Handlers ──────────────────────────────────────────────────
  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(entryAmount)
    if (!entrySourceId || !amt || amt < 0.01) return
    setIsSaving(true)
    try {
      await addEntry({
        income_source_id: entrySourceId,
        account_id: entryAccountId || null,
        amount: amt,
        note: entryNote.trim(),
        status: entryStatus,
        received_at: new Date(entryDate + 'T12:00:00').toISOString(),
      })
      setShowAdd(false)
      setEntryAmount('')
      setEntryNote('')
      setEntryAccountId('')
      setEntryStatus('expected')
      setEntryDate(now.toISOString().slice(0, 10))
    } finally {
      setIsSaving(false)
    }
  }

  const openEditEntry = (entry: IncomeEntry) => {
    setEditingEntry(entry)
    setEditSourceId(entry.income_source_id)
    setEditAccountId(entry.account_id ?? '')
    setEditAmount(String(entry.amount))
    setEditNote(entry.note)
    setEditDate(entry.received_at.slice(0, 10))
  }

  const handleUpdateEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEntry) return
    const amt = parseFloat(editAmount)
    if (!editSourceId || !amt || amt < 0.01) return
    setIsSaving(true)
    try {
      await editEntry(editingEntry.id, {
        income_source_id: editSourceId,
        account_id: editAccountId || null,
        amount: amt,
        note: editNote.trim(),
        received_at: new Date(editDate + 'T12:00:00').toISOString(),
      })
      setEditingEntry(null)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!srcName.trim()) return
    setIsSaving(true)
    try {
      const s = await addSource({ name: srcName.trim(), emoji: srcEmoji, color: srcColor })
      if (s) {
        setEntrySourceId(s.id)
        setShowAddSource(false)
        setSrcName('')
        setSrcEmoji('💰')
        setSrcColor('#10B981')
        setShowAdd(true)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const addEntryForm = (
    <form onSubmit={handleAddEntry} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Income Source</Label>
        <Select
          value={entrySourceId}
          onValueChange={(v: string | null) => {
            if (!v) return
            if (v === '__new__') { setShowAdd(false); setShowAddSource(true) }
            else setEntrySourceId(v)
          }}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Select source" />
          </SelectTrigger>
          <SelectContent>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.emoji} {s.name}</SelectItem>
            ))}
            <SelectItem value="__new__">➕ Add new source…</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Amount (₱)</Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
          <Input
            type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00"
            value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)}
            className="pl-8 h-12 text-lg font-semibold rounded-xl" required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">
          Note <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          placeholder="e.g. May salary"
          value={entryNote} onChange={(e) => setEntryNote(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Date Received</Label>
        <Input
          type="date" value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className="h-11 rounded-xl" required
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Status</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['expected', 'received'] as const).map((s) => (
            <button
              key={s} type="button"
              onClick={() => setEntryStatus(s)}
              className={cn(
                'h-11 rounded-xl text-sm font-semibold border transition-colors',
                entryStatus === s
                  ? s === 'expected'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted border-border text-muted-foreground hover:bg-accent'
              )}
            >
              {s === 'expected' ? '⏳ Expected' : '✓ Received'}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-semibold">
          Account <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <AccountSelector value={entryAccountId} onChange={setEntryAccountId} />
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
          onClick={() => setShowAdd(false)}>Cancel</Button>
        <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold"
          disabled={isSaving || !entrySourceId}>
          {isSaving ? 'Saving…' : 'Log Income'}
        </Button>
      </div>
    </form>
  )

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Income</h1>
          <p className="text-sm text-muted-foreground">{dateFilterLabel(appliedDateFilter)}</p>
        </div>
        <Button type="button" onClick={() => setShowAdd(true)} className="h-9 rounded-xl text-sm gap-1.5">
          <Plus className="w-4 h-4" />
          Log Income
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl w-full justify-between"
          onClick={openFilters}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </span>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
          <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(totalReceived)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Received</p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
          <p className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(totalExpected)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Expected</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Avg per Entry', value: formatCurrency(avgEntry),    color: 'text-foreground' },
          { label: 'Entries',       value: String(filtered.length),     color: 'text-foreground' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-3 text-center">
            <p className={`text-base font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Source breakdown */}
      {breakdown.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">Breakdown by Source</p>
          <div className="space-y-3">
            {breakdown.map(({ id, source, amount }) => {
              const pct = totalIncome > 0 ? (amount / totalIncome) * 100 : 0
              return (
                <div key={id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium">
                      {source?.emoji ?? '💰'} {source?.name ?? 'Deleted source'}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrency(amount)} · {Math.round(pct)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: source?.color ?? '#10B981' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Entry list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">History</h2>
          <p className="text-xs text-muted-foreground">{filtered.length} entries</p>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 rounded-2xl border border-dashed border-border space-y-2">
            <p className="text-3xl">💰</p>
            <p className="font-semibold text-sm">No income logged yet</p>
            <p className="text-xs text-muted-foreground">Tap "Log Income" to add your first entry</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <IncomeEntryItem
                key={entry.id}
                entry={entry}
                source={sourceMap.get(entry.income_source_id)}
                onEdit={openEditEntry}
                onDelete={removeEntry}
                onMarkReceived={markReceived}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <Button
        type="button"
        onClick={() => setShowAdd(true)}
        size="lg"
        className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 z-50 h-14 w-14 rounded-full shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:scale-110 p-0"
      >
        <Plus className="h-6 w-6" />
        <span className="sr-only">Log income</span>
      </Button>

      {/* Add income — sheet on mobile, dialog on desktop */}
      {isMobile ? (
        <BottomSheet open={showAdd} onClose={() => setShowAdd(false)} title="Log Income">
          {addEntryForm}
        </BottomSheet>
      ) : (
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="sm:max-w-sm rounded-2xl">
            <DialogHeader><DialogTitle className="text-xl font-bold">Log Income</DialogTitle></DialogHeader>
            {addEntryForm}
          </DialogContent>
        </Dialog>
      )}

      {/* Edit income — sheet on mobile, dialog on desktop */}
      {isMobile ? (
        <BottomSheet open={!!editingEntry} onClose={() => setEditingEntry(null)} title="Edit Income">
          <form onSubmit={handleUpdateEntry} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Income Source</Label>
              <Select value={editSourceId} onValueChange={(v: string | null) => v && setEditSourceId(v)}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.emoji} {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Amount (₱)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                <Input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00"
                  value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                  className="pl-8 h-12 text-lg font-semibold rounded-xl" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="e.g. May salary" value={editNote} onChange={(e) => setEditNote(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Date Received</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-11 rounded-xl" required />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Account <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <AccountSelector value={editAccountId} onChange={setEditAccountId} />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setEditingEntry(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving || !editSourceId}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </BottomSheet>
      ) : (
        <Dialog open={!!editingEntry} onOpenChange={(open) => { if (!open) setEditingEntry(null) }}>
          <DialogContent className="sm:max-w-sm rounded-2xl">
            <DialogHeader><DialogTitle className="text-xl font-bold">Edit Income</DialogTitle></DialogHeader>
            <form onSubmit={handleUpdateEntry} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Income Source</Label>
                <Select value={editSourceId} onValueChange={(v: string | null) => v && setEditSourceId(v)}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.emoji} {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Amount (₱)</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                  <Input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00"
                    value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                    className="pl-8 h-12 text-lg font-semibold rounded-xl" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input placeholder="e.g. May salary" value={editNote} onChange={(e) => setEditNote(e.target.value)} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Date Received</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-11 rounded-xl" required />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Account <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <AccountSelector value={editAccountId} onChange={setEditAccountId} />
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setEditingEntry(null)}>Cancel</Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving || !editSourceId}>
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Add source dialog */}
      <Dialog open={showAddSource} onOpenChange={(open) => {
        setShowAddSource(open)
        if (!open) setShowAdd(true)
      }}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">New Income Source</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSource} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_EMOJIS_INCOME.map((em) => (
                  <button
                    key={em} type="button" onClick={() => setSrcEmoji(em)}
                    className={cn(
                      'w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-colors',
                      srcEmoji === em ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted hover:bg-accent'
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
                placeholder="e.g. Cookie Business"
                value={srcName} onChange={(e) => setSrcName(e.target.value)}
                className="h-11 rounded-xl" required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c} type="button" onClick={() => setSrcColor(c)}
                    aria-label={`Select color ${c}`}
                    className={cn(
                      'w-7 h-7 rounded-full transition-transform',
                      srcColor === c && 'ring-2 ring-offset-2 ring-primary scale-110'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl"
                onClick={() => { setShowAddSource(false); setShowAdd(true) }}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-xl font-semibold" disabled={isSaving}>
                {isSaving ? 'Adding…' : 'Add Source'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {isMobile ? (
        <BottomSheet open={showFilters} onClose={() => setShowFilters(false)} title="Filters">
          <IncomeFilterPanel
            draftFilters={draftFilters}
            toggleDraftValue={toggleDraftValue}
            draftDateFilter={draftDateFilter}
            onSelectPreset={selectDatePreset}
            onCustomFrom={setDraftCustomFrom}
            onCustomTo={setDraftCustomTo}
            onMonth={setDraftMonth}
            onYear={setDraftYear}
            onClearDate={clearDraftDateFilter}
            onApply={handleApplyFilters}
            onClearAll={handleClearDraftFilters}
            onReset={handleResetDraftFilters}
            sources={sources}
            accounts={accounts}
          />
        </BottomSheet>
      ) : (
        <Dialog open={showFilters} onOpenChange={setShowFilters}>
          <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold">Filters</h2>
            <IncomeFilterPanel
              draftFilters={draftFilters}
              toggleDraftValue={toggleDraftValue}
              draftDateFilter={draftDateFilter}
              onSelectPreset={selectDatePreset}
              onCustomFrom={setDraftCustomFrom}
              onCustomTo={setDraftCustomTo}
              onMonth={setDraftMonth}
              onYear={setDraftYear}
              onClearDate={clearDraftDateFilter}
              onApply={handleApplyFilters}
              onClearAll={handleClearDraftFilters}
              onReset={handleResetDraftFilters}
              sources={sources}
              accounts={accounts}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function IncomeFilterPanel({
  draftFilters, toggleDraftValue, draftDateFilter,
  onSelectPreset, onCustomFrom, onCustomTo, onMonth, onYear, onClearDate,
  onApply, onClearAll, onReset, sources, accounts,
}: {
  draftFilters: IncomeFilters
  toggleDraftValue: (key: keyof IncomeFilters, value: string) => void
  draftDateFilter: DateFilterState
  onSelectPreset: (preset: DatePresetKey) => void
  onCustomFrom: (value: string) => void
  onCustomTo: (value: string) => void
  onMonth: (value: string) => void
  onYear: (value: string) => void
  onClearDate: () => void
  onApply: () => void
  onClearAll: () => void
  onReset: () => void
  sources: Array<{ id: string; emoji: string; name: string }>
  accounts: Array<{ id: string; emoji: string; name: string }>
}) {
  const draftCount = countActiveIncomeFilters(draftFilters) + (draftDateFilter.mode !== 'none' ? 1 : 0)

  return (
    <div className="space-y-5 py-2">
      {/* Date Range — Preset / Custom / Month-Year are mutually exclusive */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date Range</p>
          {draftDateFilter.mode !== 'none' && (
            <button type="button" onClick={onClearDate} className="text-xs text-primary hover:underline">
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESET_OPTIONS.map((opt) => {
            const active = draftDateFilter.mode === 'preset' && draftDateFilter.preset === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelectPreset(opt.value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={draftDateFilter.customFrom}
              onChange={(e) => onCustomFrom(e.target.value)}
              className="h-10 rounded-xl text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={draftDateFilter.customTo}
              onChange={(e) => onCustomTo(e.target.value)}
              className="h-10 rounded-xl text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select value={draftDateFilter.month} onValueChange={(v: string | null) => v && onMonth(v)}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={draftDateFilter.year} onValueChange={(v: string | null) => v && onYear(v)}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <FilterCheckboxGroup
        title="Income Source"
        options={sources.map((s) => ({ value: s.id, label: `${s.emoji} ${s.name}` }))}
        selected={draftFilters.sources}
        onToggle={(v) => toggleDraftValue('sources', v)}
      />
      <FilterCheckboxGroup
        title="Source Account"
        options={accounts.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` }))}
        selected={draftFilters.accounts}
        onToggle={(v) => toggleDraftValue('accounts', v)}
      />
      <FilterCheckboxGroup
        title="Source Account Type"
        options={ACCOUNT_TYPE_OPTIONS}
        selected={draftFilters.accountTypes}
        onToggle={(v) => toggleDraftValue('accountTypes', v)}
      />
      <FilterCheckboxGroup
        title="Income Type"
        options={INCOME_TYPE_OPTIONS}
        selected={draftFilters.incomeTypes}
        onToggle={(v) => toggleDraftValue('incomeTypes', v)}
      />

      <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1">
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={onClearAll}>
          Clear All
        </Button>
        <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={onReset}>
          Reset
        </Button>
        <Button type="button" className="flex-1 h-11 rounded-xl font-semibold" onClick={onApply}>
          Apply{draftCount > 0 ? ` (${draftCount})` : ''}
        </Button>
      </div>
    </div>
  )
}
