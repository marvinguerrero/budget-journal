import { Expense, FinancialAccount, SharedBudget } from '@/types'

export type ExpenseIntegritySeverity = 'error' | 'warning'

export interface ExpenseIntegrityIssue {
  expenseId: string
  issueType: string
  description: string
  severity: ExpenseIntegritySeverity
}

export interface ExpenseIntegrityRefs {
  accountsById?: Map<string, FinancialAccount>
  sharedBudgetsById?: Map<string, Pick<SharedBudget, 'id' | 'category' | 'item'>>
  sharedExpenseIds?: Set<string>
}

function isValidDate(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(new Date(value).getTime())
}

function isValidAmount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function isCreditCardType(type: string | undefined | null) {
  return type === 'credit' || type?.toLowerCase().trim() === 'credit card'
}

function isRecord(value: unknown): value is Partial<Expense> & Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function getExpenseIntegrityIssues(
  expense: unknown,
  refs: ExpenseIntegrityRefs = {}
): ExpenseIntegrityIssue[] {
  if (!isRecord(expense)) {
    return [{
      expenseId: 'missing-id',
      issueType: 'Invalid Expense Record',
      description: `Expense record is ${expense === null ? 'null' : typeof expense}.`,
      severity: 'error',
    }]
  }

  const expenseId = typeof expense.id === 'string' && expense.id ? expense.id : 'missing-id'
  const issues: ExpenseIntegrityIssue[] = []

  const addIssue = (
    issueType: string,
    description: string,
    severity: ExpenseIntegritySeverity = 'error'
  ) => {
    issues.push({ expenseId, issueType, description, severity })
  }

  if (!hasText(expense.id)) {
    addIssue('Missing Expense ID', 'Expense record has no valid id.')
  }

  if (expense.amount === null || expense.amount === undefined) {
    addIssue('Missing Amount', 'amount is null or missing.')
  } else if (!isValidAmount(expense.amount)) {
    addIssue('Invalid Amount', `amount=${String(expense.amount)} is not a finite number.`)
  }

  if (!isValidDate(expense.created_at)) {
    addIssue('Invalid Date', `created_at=${String(expense.created_at)} is missing or invalid.`)
  }

  if (!hasText(expense.category)) {
    addIssue('Missing Category', 'category is missing or empty.')
  }

  if (expense.note !== null && expense.note !== undefined && typeof expense.note !== 'string') {
    addIssue('Invalid Note', `note has invalid type ${typeof expense.note}.`, 'warning')
  }

  if (expense.account_id) {
    if (typeof expense.account_id !== 'string') {
      addIssue('Invalid Account Reference', `account_id=${String(expense.account_id)} is not a string.`)
    } else {
      const account = refs.accountsById?.get(expense.account_id)
      if (refs.accountsById && !account) {
        addIssue('Missing Account Reference', `account_id=${expense.account_id} does not exist.`)
      }

      const hasCreditDates = Boolean(
        expense.credit_billing_cycle_start
        || expense.credit_billing_cycle_end
        || expense.credit_statement_date
        || expense.credit_due_date
      )
      if (hasCreditDates && account && !isCreditCardType(account.type)) {
        addIssue(
          'Invalid Credit Card Reference',
          `Expense has credit-card billing fields but account_id=${expense.account_id} is not a credit card.`,
          'warning'
        )
      }
    }
  }

  if (expense.shared_budget_id) {
    if (typeof expense.shared_budget_id !== 'string') {
      addIssue('Invalid Shared Budget Reference', `shared_budget_id=${String(expense.shared_budget_id)} is not a string.`)
    } else {
      const budget = refs.sharedBudgetsById?.get(expense.shared_budget_id)
      if (refs.sharedBudgetsById && !budget) {
        addIssue('Missing Shared Budget Reference', `shared_budget_id=${expense.shared_budget_id} does not exist.`)
      }
      if (budget && expense.shared_budget_item && budget.item !== expense.shared_budget_item) {
        addIssue(
          'Budget Item Mismatch',
          `shared_budget_item="${expense.shared_budget_item}" does not match linked budget item="${budget.item}".`,
          'warning'
        )
      }
    }
  }

  if (expense.is_shared_budget_expense === true && !expense.shared_budget_id) {
    addIssue('Missing Shared Budget Reference', 'is_shared_budget_expense=true but shared_budget_id is missing.')
  }

  if (expense.shared_budget_id && !hasText(expense.shared_budget_item)) {
    addIssue('Missing Budget Item', 'shared_budget_id exists but shared_budget_item is missing.', 'warning')
  }

  if (expense.shared_expense_id) {
    if (typeof expense.shared_expense_id !== 'string') {
      addIssue('Invalid Shared Expense Reference', `shared_expense_id=${String(expense.shared_expense_id)} is not a string.`)
    } else if (refs.sharedExpenseIds && !refs.sharedExpenseIds.has(expense.shared_expense_id)) {
      addIssue('Missing Shared Expense Reference', `shared_expense_id=${expense.shared_expense_id} does not exist.`)
    }
  }

  if ('budget_item_id' in expense && expense.budget_item_id) {
    addIssue('Legacy Budget Item Reference', 'budget_item_id exists on this record but is not part of the current expense model.', 'warning')
  }

  if ('credit_card_id' in expense && expense.credit_card_id) {
    const creditCardId = expense.credit_card_id
    if (typeof creditCardId !== 'string') {
      addIssue('Invalid Credit Card Reference', `credit_card_id=${String(creditCardId)} is not a string.`)
    } else {
      const account = refs.accountsById?.get(creditCardId)
      if (refs.accountsById && !account) {
        addIssue('Missing Credit Card Reference', `credit_card_id=${creditCardId} does not exist.`)
      } else if (account && !isCreditCardType(account.type)) {
        addIssue('Invalid Credit Card Reference', `credit_card_id=${creditCardId} points to a non-credit-card account.`)
      }
    }
  }

  return issues
}

export function isExpenseSafeToRender(
  expense: unknown,
  refs: ExpenseIntegrityRefs = {}
) {
  return getExpenseIntegrityIssues(expense, refs).every((issue) => issue.severity !== 'error')
}
