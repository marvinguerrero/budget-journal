# Budget Journal Performance Audit

Last updated: 2026-06-20

## Instrumentation Added

All high-frequency financial actions now emit grouped console timings via `lib/performance.ts`.

In development this is enabled by default. In production-like builds, enable it with:

```js
localStorage.setItem('budgetJournalPerf', '1')
```

Each action logs:

- `[PERF] <Action Name>`
- validation time where the action has a UI form
- storage upload/delete/signed URL time for receipts
- database insert/update/delete/RPC time
- account balance update time for RPC/trigger-backed money movement
- notification update time, currently `0ms` unless a measured notification step is present
- local state update time
- refetch time, including background refetches
- total action time
- warning for any grouped step over `500ms`

Example console shape:

```text
[PERF] Add Expense
validation: 20ms
storage upload: 1200ms
expense insert: 300ms
account balance update: 250ms
refetch: 900ms
notification update: 0ms
total: 2670ms
```

Each log also includes a small report object with:

- slowest operation
- inferred root cause
- fix applied
- remaining risk

## Baseline Findings

Current average time is now measurable from browser console logs, but not yet sampled from real user sessions. Until several runs are captured per action, the "current average" column below is marked as "pending sample".

| Action | Current average | Slowest likely step | Priority | Recommendation |
| --- | ---: | --- | --- | --- |
| Add expense | Pending sample | `expense insert`, `refetch`, receipt adds `storage upload` | P0 | Expense list selector is now narrowed; parent list refetch is background-timed. Consider returning complete expense details from one RPC for receipt/obligation cases. |
| Edit expense | Pending sample | `supabase.select.existing_expense_details` plus final `supabase.select.updated_expense_details`; receipt edits add storage | P0 | Skip final detail fetch when returned update row is enough; fetch only obligations/participants when obligation mode changes. |
| Delete expense | Pending sample | `supabase.rpc.delete_expense_safely_with_balance_updates`; receipt delete can add storage roundtrip | P1 | Keep local optimistic removal after RPC; consider DB-first receipt clear then background storage delete to avoid dangling DB paths. |
| Upload receipt | Pending sample | `storage upload` | P0 | Validation happens before upload; preview/signed URL is only loaded when opened; detail refresh now runs in the background after upload success. |
| Add income | Pending sample | `supabase.insert.income_entry_with_balance_trigger` | P1 | Local state update already avoids full refetch. Keep received-income balance effects in DB trigger/RPC. |
| Add account | Pending sample | `supabase.insert.financial_account` | P2 | Local state update already avoids full refetch. New index helps ordered account lists. |
| Record settlement | Pending sample | settlement insert/RPC and balance updates; previous UI waited for full balances reload | P0 | UI now closes after mutation success and refreshes balances in background. Longer term, update affected balance rows locally. |
| Record credit card payment | Pending sample | `supabase.rpc.record_credit_card_payment_with_balance_updates`; previous UI waited for balances/accounts reload | P0 | UI now closes after RPC success and refreshes balances/accounts in background. Return affected accounts from RPC to avoid reload. |
| Transfer account | Pending sample | `account balance update`; previous UI waited for account/activity reload | P0 | UI now closes after RPC success and refreshes account/activity data in background. Return affected accounts plus transfer row from RPC. |

## Architecture Bottlenecks

1. Expense list query was too broad.
   The normal expense list previously used `EXPENSE_SELECT = '*, personal_obligations(*), expense_participants(*)'`. It now uses an explicit `EXPENSE_LIST_SELECT`, keeping detail-only columns out of list fetches while preserving edit/list behavior.

2. Expense mutations do follow-up detail reads.
   Create/update expense often performs the mutation, optional obligation/participant writes, optional receipt writes, then `getExpenseById`. That final read includes nested joins and can dominate perceived completion time.

3. Balances actions were blocking modal close on full reload.
   Settlement and credit card payment flows awaited `load()` or `Promise.all([load(), reloadAccounts()])` before closing dialogs. These are now moved to background refetch after successful mutation and are logged separately.

4. Account transfer screen was blocking close on reload.
   Transfer creation awaited account/activity reloads before closing the transfer UI. It now closes after the transfer RPC succeeds and refreshes in the background.

5. Receipt delete ordering can leave inconsistent state.
   `clearExpenseReceipt` currently deletes storage before clearing DB metadata. If the DB update fails, the row can reference a missing file. This is correctness-sensitive more than latency-sensitive.

6. Client-side all-history filtering trades query latency for UI flexibility.
   Expenses and income now fetch all records once and filter locally. This works for small personal datasets but will become slow as history grows.

7. Itemization support was eager-loading contacts.
   Receipt itemization now fetches line items on the detail section, but contact data is lazy-loaded only when the line-item form opens.

## Added Indexes

`supabase/migration_064_performance_indexes.sql` adds read-path indexes for:

- account transfers by `user_id, transferred_at`
- account transfers by source/destination account and transferred date
- expenses by account and created date
- expenses by receipt status, currency, shared-budget flag, and created date
- received income by account/status/date
- expense participants by `expense_id, line_item_id, created_at`
- line items by `expense_id, created_at`
- shared settlements by payer/receiver and created date
- shared expenses by group/budget/date
- shared expense splits by expense/debtor
- notifications by user/unread/date
- wishlist items and active wishlist shares
- personal obligation settlements by payer/receiver account and created date
- financial accounts by user and created date

## Holistic Review

### Query Optimization Changes Applied

- Expenses now default to a 50-row list payload and use explicit selectors for list, mutation return, and detail fetches.
- Income entries now default to 50 rows and use explicit selectors.
- Account transfers now default to 50 rows and use explicit selectors.
- Account activity and account detail now cap each source list to 50 rows and avoid `select('*')` for major transaction tables.
- Shared group details and balances now cap shared expense and settlement history to 50 rows and fetch splits only for the loaded expense page.
- Notifications no longer fetch the full dropdown list on app shell mount. The bell fetches a cheap unread count first and lazy-loads the 20 latest notifications when opened.
- Wishlist item/share lists are capped and use narrower relation selectors.
- Dashboard server queries now fetch explicit monthly fields and cap expense/income payloads.
- Categories, income sources, and financial account types now use simple session-local service caches.

### Pages/Actions Requiring Pagination Next

- Expenses: add "Load more" or cursor pagination beyond the current 50-row default.
- Income: add "Load more" for older income records.
- Account Activity: merge per-source 50-row slices into a cursor-paginated unified feed.
- Shared Group Detail: paginate shared expenses and settlement history.
- Balances: paginate historical settlements, loans, and credit-card cycle expenses.
- Wishlist: paginate item/share lists.
- Notifications: add "Load more" after the first 20 notifications.
- Export: fetch export data via an explicit export-only path, not the visible page list.

### Features Requiring Lazy Loading

- Expense line items: line-item rows are already detail-only; contacts are now loaded only when the itemization form opens.
- Receipt previews: signed URLs are still created only when preview/download is requested.
- Shared group splits: should stay scoped to the loaded expense page, not every historical expense.
- Credit card history: cycle detail should load only when a card/cycle is opened.
- Contact details: obligation history should paginate/lazy-load for large contact histories.
- Export line items: should fetch only when export starts.

### Refetches Still To Remove

- Expense create/update still performs final detail reads. Best fix: mutation RPC returns the exact UI row plus affected account metadata.
- Balances background refetch still reloads broad balance data after settlement/card actions. Best fix: settlement/card RPC returns affected obligations, settlements, and accounts.
- Account transfer background refetch still reloads accounts and activity. Best fix: transfer RPC returns created transfer plus source/destination account rows.
- Shared group mutations still call full `load()` in several flows. Best fix: update local members/budgets/expenses/settlements directly after mutation.

### RPC Candidates

- `create_expense_full`: create expense, update account through existing trigger/RPC, optionally create obligation/participants, optionally return list-row + detail-row.
- `update_expense_full`: update expense, reconcile obligation/participants/receipt metadata, return affected rows.
- `record_settlement_full`: create/apply/confirm settlement and return updated obligation, settlement, and affected account rows.
- `record_credit_card_payment_full`: return payment, transfer, card account, and source account in one RPC response.
- `create_shared_expense_full`: insert shared expense, splits, optional account source, and notification rows in one transaction.
- `convert_wishlist_to_budget_full`: return updated wishlist item and new/updated budget row.

### Mobile-Specific Risks

- Client-side filtering over large arrays can still block mobile Safari if the user loads older history. Pagination is the real fix.
- Large Balances memo chains can still be expensive because they derive many views from the same loaded arrays. Splitting tabs into smaller lazy components is recommended.
- XLSX export is heavy on mobile. Prefer CSV for mobile or perform export in a web worker/server path.
- Receipt upload progress is currently immediate loading feedback but not byte-progress. Supabase Storage upload progress support or a custom upload path would improve perceived upload time.

### Prioritized Implementation Plan

1. Add cursor pagination UI for Expenses, Income, Notifications, and Account Activity.
2. Move expense/income filters that map cleanly to columns into Supabase queries: date, category/source, account, receipt status, currency, status.
3. Create RPCs for expense save, settlement/card payment, and transfer workflows to return affected rows and eliminate broad background refetches.
4. Split Balances into tab-level data loaders so credit cards, loans, settlements, and shared balances do not all load together.
5. Add export-only data paths with explicit user intent and progress feedback.
6. Add a small performance sampling table or dev-only log collector so `[PERF]` averages can be compared over time.

## Next Fixes

1. Split expense list and expense detail selectors.
   First pass is applied with `EXPENSE_LIST_SELECT`. Next step is to remove nested participants/obligations entirely from the list by moving edit forms to fetch full detail on open.

2. Add range-limited server queries for filters.
   Keep flexible UI filters, but default to a recent window and load older history on demand.

3. Return affected rows from mutation RPCs.
   Transfer, settlement confirmation, and credit card payment RPCs should return affected account rows and created payment/transfer rows so the UI can update local state without reload.

4. Make receipt metadata update return the updated expense row.
   Avoid the final detail fetch when only `receipt_path` and `has_receipt` changed.

5. Persist telemetry samples.
   Console timings are enough for diagnosis. For averages, store anonymized action timings in a local dev table or export logs from several manual runs.
