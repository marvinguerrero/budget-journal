<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Budget Journal - AI Handoff & Project Knowledge Base

Last verified against the codebase on 2026-05-29.

## Product Summary

Budget Journal is evolving from a simple budget tracker into a personal finance operating system. Its north star is to be a single source of truth for real-life finances: available cash, debt, account balances, shared obligations, money owed by others, and money owed to others.

The project is primarily for an individual personal finance user, with secondary future use cases for couples, families, travel groups, friends splitting expenses, and other small collaborative groups.

The strategic direction is:

- Personal finance
- Collaborative finance
- Debt tracking
- Settlement management

It is intentionally not a banking platform, accounting suite, investment platform, or tax product.

## Core Product Principle

The app started from the creator's own finance problems. New features should be driven by real encountered needs, not by generic "this app should have X" thinking.

Primary questions the app should help answer:

- How much money do I really have?
- How much debt do I have?
- Which account contains my money?
- Who owes me?
- Who do I owe?
- What is my actual financial position?

## Verified Current Stack

- Next.js 16.2.6
- React 19.2.4
- TypeScript
- Supabase Auth
- Supabase/PostgreSQL
- Vercel-oriented Next app structure
- Tailwind CSS 4
- shadcn/Radix-style UI components
- Zustand is installed; most domain flows currently use hooks/services directly

## Architecture North Star

Financial Accounts are the source of truth.

Expenses, income, transfers, shared expenses, and settlements should connect to financial accounts wherever balance impact matters. This replaced the older payment-method-centered model.

Payment methods are deprecated in product behavior. A historical `payment_methods` migration and old `payment_method` field may still exist for compatibility, but active expense flows use `account_id`.

Avoid adding full accounting complexity unless explicitly requested. The app currently avoids:

- Double-entry accounting
- Bank integrations
- Stock APIs
- Loan amortization
- Complex reconciliation engines
- Tax/accounting ledger behavior
- Autonomous AI finance actions

## Verified Domain Model

Core entities present in the app and migrations include:

- Users/profiles
- Expenses
- Budgets
- Categories
- Income sources
- Income entries
- Financial accounts
- Account transfers
- Shared groups
- Shared group members
- Shared budgets
- Shared expenses
- Shared expense splits
- Shared expense settlements
- Permission requests
- Notifications
- Shared group messages

Standalone `receivables` and `payables` tables are not currently present. Interpersonal balances are computed from shared expense splits and settlement records.

## Financial Accounts

Financial accounts are implemented in `financial_accounts`.

Account types:

- Asset: `cash`, `bank`, `ewallet`, `savings`, `investment`
- Liability: `credit`, `loan`

Liability accounts store debt as a negative balance in the current UI/service model. Display logic shows liability debt as a positive "owed" amount.

Financial account management is available in Settings.

## Balance Logic

The database uses triggers/RPCs to keep balances in sync for the major money movements.

Current behavior:

- Asset expense: account balance decreases
- Liability expense: debt increases by making the liability balance more negative
- Received income: account balance increases
- Expected income: no balance impact
- Transfer: source decreases and destination increases
- Shared expense with confirmed payment source: payer account balance changes
- Settlement payment by payer: creates a settlement expense when a payer account is selected
- Settlement confirmation by receiver: can create received income when a receiver account is selected

Financial correctness is more important than UI polish.

## Implemented Features

Authentication:

- Supabase Authentication
- Email auth is implemented
- Google OAuth appears planned/configurable, but verify environment/provider setup before relying on it

Expense tracking:

- Expenses use categories, notes, amount, date, and optional financial account
- Expense creation no longer relies on payment methods

Income tracking:

- Income sources and income entries are implemented
- Income status supports `expected` and `received`
- Only received income affects account balances

Financial accounts:

- Asset/liability account model is implemented
- Account creation, editing, and deletion live in Settings
- Account summaries and filters live under account activity

Account activity:

- Account activity list exists at `/activity/accounts`
- Account detail navigation exists at `/activity/accounts/[id]`
- Detail history includes expenses, shared expenses, received income, and transfers

Internal transfers:

- Implemented through `account_transfers`
- Transfer UI exists in the account activity flow

Shared budgets and groups:

- Shared groups, invites/members, permissions, shared budgets, and group messages are implemented

Shared expense splitting:

- Shared expenses support equal/custom-style split data through `shared_expense_splits`
- Shared expenses track payer, participants, account source, and payment source status

Settlement workflows:

- Settlement records exist in `shared_expense_settlements`
- Statuses include `pending_confirmation`, `confirmed`, `rejected`, and `recalled`
- Confirm, reject, and recall RPC/service flows are implemented

Balances/debt center:

- `/balances` aggregates group balances by counterparty
- It shows "you owe", "owed to you", pending incoming confirmations, and pending outgoing settlements

Settings:

- Theme/profile controls
- Custom categories
- Custom income sources
- Financial accounts

## In Progress / Watch Closely

These areas exist but are still product-sensitive and easy to break:

- Settlement consistency
- Recall settlement behavior
- Shared expense payment source confirmation
- Privacy-preserving shared payment source flow
- Account balance correctness across edits/deletes
- Shared finance edge cases with multiple members and custom splits

## Planned / Future Features

Likely next priorities:

1. Harden account activity and account detail history.
2. Refine the balances/debt module UX.
3. Strengthen settlement confirmation, rejection, and recall flows.
4. Finish shared budget payment source confirmation and privacy guarantees.
5. Improve financial dashboard summaries: assets, liabilities, net position.
6. Add financial insights/reporting after core correctness is stable.

Future ideas only after the above are stable:

- Reminders
- Statement-of-account style views
- Financial health scoring
- AI-powered insights
- Investment tracking
- Advanced analytics

## Shared Finance Privacy Rule

Users should not see another user's financial accounts. In shared expense flows, only the responsible payer should choose or confirm their own payment source. Treat this as a product and privacy invariant.

## Development Standards

- TypeScript first
- Reuse existing components, hooks, and service patterns
- Keep database changes deliberate and migration-based
- Prefer simple financial models over accounting-system complexity
- Preserve mobile-first behavior and dark mode support
- Reuse existing design language and UI primitives
- Keep balance-affecting code easy to audit

## Known Risks

- Balance corruption from mismatched triggers, service writes, or edit/delete behavior
- Settlement inconsistencies between payer expense and receiver income records
- Shared finance edge cases around payer/source confirmation
- Feature creep toward accounting software
- Over-modeling debt before real use cases require it
