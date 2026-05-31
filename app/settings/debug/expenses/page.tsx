'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  ExpenseIntegrityReport,
  runExpenseIntegrityCheck,
} from '@/services/expenseIntegrity'
import { AlertTriangle, Bug, CheckCircle2, RefreshCw } from 'lucide-react'

export default function ExpenseIntegrityDebugPage() {
  const [report, setReport] = useState<ExpenseIntegrityReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runCheck = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const nextReport = await runExpenseIntegrityCheck()
      console.debug('[expense-integrity] report', nextReport)
      setReport(nextReport)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run expense integrity check'
      console.error('[expense-integrity] failed', err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const errorIssues = report?.issues.filter((issue) => issue.severity === 'error') ?? []
  const warningIssues = report?.issues.filter((issue) => issue.severity === 'warning') ?? []

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5 max-w-3xl">
      <div className="space-y-1">
        <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground">
          Settings
        </Link>
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Expense Integrity Check</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Temporary diagnostic scanner for malformed expense records and orphaned references.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Run Scanner</p>
            <p className="text-xs text-muted-foreground">Scans only records visible to the current signed-in user.</p>
          </div>
          <Button type="button" onClick={runCheck} disabled={isLoading} className="rounded-xl gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Scanning...' : 'Run Check'}
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      {report && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Expenses</p>
              <p className="text-2xl font-bold tabular-nums">{report.totalExpenses}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-xs text-muted-foreground">Valid Expenses</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{report.validExpenses}</p>
            </div>
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
              <p className="text-xs text-muted-foreground">Invalid Expenses</p>
              <p className="text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-400">{report.invalidExpenses}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Detected Issues</p>
                <p className="text-xs text-muted-foreground">
                  Scanned {new Date(report.scannedAt).toLocaleString('en-PH')}
                </p>
              </div>
              {report.issues.length === 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Clean
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {report.issues.length} issue{report.issues.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <Separator />

            {report.issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No malformed expense records or orphaned references were detected.</p>
            ) : (
              <div className="space-y-3">
                {errorIssues.length > 0 && (
                  <IssueList title="Errors" tone="error" issues={errorIssues} />
                )}
                {warningIssues.length > 0 && (
                  <IssueList title="Warnings" tone="warning" issues={warningIssues} />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function IssueList({
  title,
  tone,
  issues,
}: {
  title: string
  tone: 'error' | 'warning'
  issues: ExpenseIntegrityReport['issues']
}) {
  const toneClass = tone === 'error'
    ? 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400'
    : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400'

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {issues.map((issue, index) => (
        <div key={`${issue.expenseId}-${issue.issueType}-${index}`} className={`rounded-xl border p-3 ${toneClass}`}>
          <p className="text-xs font-semibold">Expense ID: {issue.expenseId}</p>
          <p className="mt-1 text-sm font-bold">{issue.issueType}</p>
          <p className="mt-1 text-xs opacity-90">{issue.description}</p>
        </div>
      ))}
    </div>
  )
}
