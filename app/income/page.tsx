'use client'

import { useState, useMemo } from 'react'
import { IncomeEntry } from '@/types'
import { useIncomeSources } from '@/hooks/useIncomeSources'
import { useIncomeEntries } from '@/hooks/useIncomeEntries'
import { IncomeEntryItem } from '@/components/income/IncomeEntryItem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { BottomSheet } from '@/components/common/BottomSheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/useIsMobile'
import { PRESET_COLORS, PRESET_EMOJIS_INCOME } from '@/lib/constants'
import { AccountSelector } from '@/components/accounts/AccountSelector'
import { formatCurrency, getMonthName } from '@/utils/format'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: getMonthName(i + 1),
}))
const YEARS = ['2024', '2025', '2026']
const DAYS  = Array.from({ length: 31 }, (_, i) => String(i + 1))

export default function IncomePage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear]   = useState(String(now.getFullYear()))
  const [day,   setDay]   = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [showAdd, setShowAdd]           = useState(false)
  const [showAddSource, setShowAddSource] = useState(false)
  const isMobile = useIsMobile()

  const { sources, addSource, removeSource } = useIncomeSources()
  const { entries, isLoading, addEntry, editEntry, removeEntry } = useIncomeEntries(
    month === 'all' ? undefined : Number(month),
    year  === 'all' ? undefined : Number(year)
  )

  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])

  // ── Add entry form state ─────────────────────────────────────
  const [entrySourceId, setEntrySourceId] = useState('')
  const [entryAccountId, setEntryAccountId] = useState('')
  const [entryAmount, setEntryAmount]     = useState('')
  const [entryNote, setEntryNote]         = useState('')
  const [entryDate, setEntryDate]         = useState(now.toISOString().slice(0, 10))
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
      if (sourceFilter !== 'all' && e.income_source_id !== sourceFilter) return false
      if (day !== 'all' && new Date(e.received_at).getDate() !== Number(day)) return false
      return true
    }),
    [entries, sourceFilter, day]
  )
  const totalIncome = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered])
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
        received_at: new Date(entryDate + 'T12:00:00').toISOString(),
      })
      setShowAdd(false)
      setEntryAmount('')
      setEntryNote('')
      setEntryAccountId('')
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
          <p className="text-sm text-muted-foreground">
            {day !== 'all' ? `Day ${day} · ` : ''}
            {month === 'all' ? 'All months' : getMonthName(Number(month))}
            {year !== 'all' ? ` ${year}` : ''}
          </p>
        </div>
        <Button type="button" onClick={() => setShowAdd(true)} className="h-9 rounded-xl text-sm gap-1.5">
          <Plus className="w-4 h-4" />
          Log Income
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select value={day} onValueChange={(v: string | null) => setDay(v || 'all')}>
            <SelectTrigger className="h-10 rounded-xl w-[72px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All days</SelectItem>
              {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={(v: string | null) => v && setMonth(v)}>
            <SelectTrigger className="h-10 rounded-xl flex-1 min-w-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={(v: string | null) => v && setYear(v)}>
            <SelectTrigger className="h-10 rounded-xl w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Select value={sourceFilter} onValueChange={(v: string | null) => setSourceFilter(v || 'all')}>
          <SelectTrigger className="h-10 rounded-xl w-full">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.emoji} {s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Income',   value: formatCurrency(totalIncome), color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Avg per Entry',  value: formatCurrency(avgEntry),    color: 'text-foreground' },
          { label: 'Entries',        value: String(filtered.length),     color: 'text-foreground' },
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
    </div>
  )
}
