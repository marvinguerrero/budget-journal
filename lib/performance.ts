type PerfEntry = {
  step: string
  durationMs: number
  meta?: Record<string, unknown>
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
    const payload = {
      action: this.action,
      totalMs: Math.round(totalMs),
      ...this.meta,
      ...meta,
    }

    console.groupCollapsed(`[perf] ${this.action} ${Math.round(totalMs)}ms`)
    console.log(payload)
    console.table(this.entries.map((entry) => ({
      step: entry.step,
      durationMs: Math.round(entry.durationMs),
      ...(entry.meta ?? {}),
    })))
    console.groupEnd()
  }
}

export function createActionTrace(action: string, meta?: Record<string, unknown>) {
  return new ActionTrace(action, meta)
}

export function perfNow() {
  return now()
}
