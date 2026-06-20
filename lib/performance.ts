type PerfEntry = {
  step: string
  durationMs: number
  meta?: Record<string, unknown>
}

const SLOW_STEP_MS = 500

const ACTION_LABELS: Record<string, string> = {
  'ui.expense_form.submit_add': 'Add Expense',
  'ui.expense_form.submit_edit': 'Edit Expense',
  'expense.add': 'Add Expense',
  'expense.edit': 'Edit Expense',
  'expense.delete': 'Delete Expense',
  'service.expense.create': 'Add Expense',
  'service.expense.update': 'Edit Expense',
  'service.expense.delete': 'Delete Expense',
  'ui.receipt.upload': 'Upload Receipt',
  'service.expense.set_receipt': 'Upload Receipt',
  'service.receipt.upload': 'Upload Receipt',
  'ui.income_form.submit_add': 'Add Income',
  'income.add': 'Add Income',
  'service.income.create': 'Add Income',
  'ui.personal_settlement.submit': 'Record Payment',
  'ui.shared_settlement.submit_create': 'Record Payment',
  'ui.settlement_review.submit_confirm': 'Record Payment',
  'ui.credit_card_payment.submit': 'Record Payment',
  'service.personal_settlement.apply': 'Record Payment',
  'service.personal_settlement.confirm': 'Record Payment',
  'service.personal_settlement.record_external': 'Record Payment',
  'service.shared_settlement.create': 'Record Payment',
  'service.shared_settlement.confirm': 'Record Payment',
  'service.credit_card_payment.record': 'Record Payment',
  'ui.account_transfer.submit': 'Transfer Account',
  'transfer.add': 'Transfer Account',
  'service.transfer.create': 'Transfer Account',
}

function perfEnabled() {
  if (process.env.NODE_ENV !== 'production') return true
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem('budgetJournalPerf') === '1'
}

function getPerformance() {
  return typeof performance !== 'undefined' ? performance : null
}

function now() {
  return getPerformance()?.now() ?? Date.now()
}

function displayAction(action: string) {
  return ACTION_LABELS[action] ?? action
}

function displayStep(step: string) {
  const value = step.toLowerCase()
  if (value.includes('validation')) return 'validation'
  if (value.includes('storage.upload') || value.includes('upload.receipt')) return 'storage upload'
  if (value.includes('storage.delete') || value.includes('delete_receipt')) return 'storage delete'
  if (value.includes('signed_url')) return 'receipt signed url'
  if (value.includes('insert.expense')) return 'expense insert'
  if (value.includes('update.expense') && value.includes('receipt')) return 'receipt metadata update'
  if (value.includes('update.expense')) return 'expense update'
  if (value.includes('delete_expense') || value.includes('delete.expense')) return 'expense delete'
  if (value.includes('income_entry')) return value.includes('insert') ? 'income insert' : 'income update'
  if (value.includes('financial_account')) return value.includes('insert') ? 'account insert' : 'account update'
  if (value.includes('transfer') || value.includes('credit_card_payment') || value.includes('settlement') || value.includes('balance')) {
    if (value.includes('refetch')) return 'refetch'
    if (value.includes('notification')) return 'notification update'
    return 'account balance update'
  }
  if (value.includes('notification')) return 'notification update'
  if (value.includes('local_state')) return 'local state update'
  if (value.includes('refetch') || value.includes('select')) return 'refetch'
  if (value.includes('auth')) return 'auth'
  return step.replaceAll('.', ' ')
}

export class ActionTrace {
  private readonly id: string
  private readonly startTime = now()
  private readonly entries: PerfEntry[] = []
  private readonly enabled = perfEnabled()

  constructor(
    private readonly action: string,
    private readonly meta: Record<string, unknown> = {},
  ) {
    this.id = `${action}:${Math.random().toString(36).slice(2)}`
    this.mark('ui.click')
  }

  mark(step: string, meta?: Record<string, unknown>) {
    if (!this.enabled) return
    const perf = getPerformance()
    perf?.mark(`${this.id}:${step}`)
    this.entries.push({ step, durationMs: now() - this.startTime, meta })
  }

  async step<T>(step: string, fn: () => PromiseLike<T> | Promise<T>, meta?: Record<string, unknown>): Promise<T> {
    if (!this.enabled) return fn()
    const start = now()
    try {
      return await fn()
    } finally {
      this.entries.push({ step, durationMs: now() - start, meta })
    }
  }

  measure(step: string, startTime: number, meta?: Record<string, unknown>) {
    if (!this.enabled) return
    this.entries.push({ step, durationMs: now() - startTime, meta })
  }

  end(meta?: Record<string, unknown>) {
    if (!this.enabled) return
    const totalMs = now() - this.startTime
    const actionLabel = displayAction(this.action)
    const payload = {
      action: this.action,
      totalMs: Math.round(totalMs),
      ...this.meta,
      ...meta,
    }
    const groupedEntries = new Map<string, number>()
    for (const entry of this.entries) {
      const label = displayStep(entry.step)
      groupedEntries.set(label, (groupedEntries.get(label) ?? 0) + entry.durationMs)
    }
    const slowEntries = [...groupedEntries.entries()]
      .filter(([, durationMs]) => durationMs > SLOW_STEP_MS)
      .sort((a, b) => b[1] - a[1])
    const slowest = [...groupedEntries.entries()].sort((a, b) => b[1] - a[1])[0]

    console.groupCollapsed(`[PERF] ${actionLabel}`)
    console.log(`total: ${Math.round(totalMs)}ms`)
    for (const [step, durationMs] of groupedEntries.entries()) {
      console.log(`${step}: ${Math.round(durationMs)}ms`)
    }
    if (!groupedEntries.has('notification update')) {
      console.log('notification update: 0ms')
    }
    if (slowEntries.length > 0) {
      console.warn('[PERF] Steps over 500ms', slowEntries.map(([step, durationMs]) => `${step}: ${Math.round(durationMs)}ms`))
    }
    console.info('[PERF] Report', {
      slowestOperation: slowest ? slowest[0] : 'none',
      slowestDurationMs: slowest ? Math.round(slowest[1]) : 0,
      rootCause: slowest ? inferRootCause(slowest[0]) : 'No measured bottleneck.',
      fixApplied: inferFixApplied(this.action, slowest?.[0]),
      remainingRisk: inferRemainingRisk(slowest?.[0]),
    })
    console.log(payload)
    console.table(this.entries.map((entry) => ({
      step: entry.step,
      label: displayStep(entry.step),
      durationMs: Math.round(entry.durationMs),
      ...(entry.meta ?? {}),
    })))
    console.groupEnd()
  }
}

function inferRootCause(step?: string) {
  if (!step) return 'No slow measured step.'
  if (step.includes('storage')) return 'Receipt file transfer or storage API latency.'
  if (step.includes('refetch')) return 'Post-action data reload is still expensive or querying too much data.'
  if (step.includes('account balance')) return 'Database RPC/trigger work is doing balance, settlement, or transfer updates.'
  if (step.includes('insert') || step.includes('update') || step.includes('delete')) return 'Database mutation latency, including trigger/RLS work.'
  return 'Client-side action or local state work.'
}

function inferFixApplied(action: string, step?: string) {
  if (action.includes('background_refetch')) return 'Refetch runs in the background after the critical UI action completes.'
  if (step?.includes('refetch')) return 'Critical actions avoid waiting for several known broad refetches; remaining refetch is now visible in logs.'
  if (step?.includes('storage')) return 'File validation runs before upload, and signed URLs/previews are lazy-loaded.'
  return 'Action has immediate loading feedback and timing instrumentation.'
}

function inferRemainingRisk(step?: string) {
  if (step?.includes('refetch')) return 'Large history tables or select-heavy queries can still dominate until list/detail selectors are split further.'
  if (step?.includes('storage')) return 'Large files and network variance can still exceed 500ms.'
  if (step?.includes('account balance')) return 'RPCs/triggers may need database-side profiling if they remain slow.'
  return 'Needs several real interaction samples to establish averages.'
}

export function createActionTrace(action: string, meta?: Record<string, unknown>) {
  return new ActionTrace(action, meta)
}

export function perfNow() {
  return now()
}
