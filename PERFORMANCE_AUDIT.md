# Budget Journal Performance Audit

Last updated: 2026-06-20

## Instrumentation Added

All high-frequency financial actions now emit grouped console timings via `lib/performance.ts`.

In development this is enabled by default. In production-like builds, enable it with:

```js
localStorage.setItem('budgetJournalPerf', '1')
```

Each action logs:

- `ui.click` or action start
- validation time where the action has a UI form
- Supabase auth/mutation/query/RPC time
- storage upload/delete/signed URL time for receipts
- local state update time
- background refetch time where refetch still exists
- total action time

## Baseline Findings

Current average time is now measurable from browser console logs, but not yet sampled from real user sessions. Until several runs are captured per action, the "current average" column below is marked as "pending sample".

| Action | Current average | Slowest likely step | Priority | Recommendation |
| --- | ---: | --- | --- | --- |
| Add expense | Pending sample | `supabase.insert.expense_with_balance_trigger`, then `supabase.select.created_expense_details`; receipt adds `storage.upload.receipt` | P0 | Keep modal closure tied to mutation success, avoid broad list refetch, consider returning complete expense details from one RPC for receipt/obligation cases. |
| Edit expense | Pending sample | `supabase.select.existing_expense_details` plus final `supabase.select.updated_expense_details`; receipt edits add storage | P0 | Skip final detail fetch when returned update row is enough; fetch only obligations/participants when obligation mode changes. |
| Delete expense | Pending sample | `supabase.rpc.delete_expense_safely_with_balance_updates`; receipt delete can add storage roundtrip | P1 | Keep local optimistic removal after RPC; consider DB-first receipt clear then background storage delete to avoid dangling DB paths. |
| Upload receipt | Pending sample | `storage.upload.receipt` | P0 | Validation happens before upload; preview/signed URL is only loaded when opened. Avoid extra expense refetch if receipt metadata update result is enough. |
| Add income | Pending sample | `supabase.insert.income_entry_with_balance_trigger` | P1 | Local state update already avoids full refetch. Keep received-income balance effects in DB trigger/RPC. |
| Add account | Pending sample | `supabase.insert.financial_account` | P2 | Local state update already avoids full refetch. New index helps ordered account lists. |
| Record settlement | Pending sample | settlement insert/RPC and balance updates; previous UI waited for full balances reload | P0 | UI now closes after mutation success and refreshes balances in background. Longer term, update affected balance rows locally. |
| Record credit card payment | Pending sample | `supabase.rpc.record_credit_card_payment_with_balance_updates`; previous UI waited for balances/accounts reload | P0 | UI now closes after RPC success and refreshes balances/accounts in background. Return affected accounts from RPC to avoid reload. |
| Transfer account | Pending sample | `supabase.rpc.create_transfer_with_balance_updates`; previous UI waited for account/activity reload | P0 | UI now closes after RPC success and refreshes account/activity data in background. Return affected accounts plus transfer row from RPC. |

## Architecture Bottlenecks

1. Expense list query is too broad.
   `EXPENSE_SELECT = '*, personal_obligations(*), expense_participants(*)'` means normal expense list screens fetch nested obligations and participants for every expense. This is expensive, especially now that the expenses page fetches full history for client-side multi-select filters.

2. Expense mutations do follow-up detail reads.
   Create/update expense often performs the mutation, optional obligation/participant writes, optional receipt writes, then `getExpenseById`. That final read includes nested joins and can dominate perceived completion time.

3. Balances actions were blocking modal close on full reload.
   Settlement and credit card payment flows awaited `load()` or `Promise.all([load(), reloadAccounts()])` before closing dialogs. These are now moved to background refetch after successful mutation.

4. Account transfer screen was blocking close on reload.
   Transfer creation awaited account/activity reloads before closing the transfer UI. It now closes after the transfer RPC succeeds and refreshes in the background.

5. Receipt delete ordering can leave inconsistent state.
   `clearExpenseReceipt` currently deletes storage before clearing DB metadata. If the DB update fails, the row can reference a missing file. This is correctness-sensitive more than latency-sensitive.

6. Client-side all-history filtering trades query latency for UI flexibility.
   Expenses and income now fetch all records once and filter locally. This works for small personal datasets but will become slow as history grows.

## Added Indexes

`supabase/migration_064_performance_indexes.sql` adds read-path indexes for:

- account transfers by `user_id, transferred_at`
- expense participants by `expense_id, line_item_id, created_at`
- line items by `expense_id, created_at`
- shared settlements by payer/receiver and created date
- financial accounts by user and created date

## Next Fixes

1. Split expense list and expense detail selectors.
   Use a narrow list query for `/expenses` and reserve nested obligations/participants for details only.

2. Add range-limited server queries for filters.
   Keep flexible UI filters, but default to a recent window and load older history on demand.

3. Return affected rows from mutation RPCs.
   Transfer, settlement confirmation, and credit card payment RPCs should return affected account rows and created payment/transfer rows so the UI can update local state without reload.

4. Make receipt metadata update return the updated expense row.
   Avoid the final detail fetch when only `receipt_path` and `has_receipt` changed.

5. Persist telemetry samples.
   Console timings are enough for diagnosis. For averages, store anonymized action timings in a local dev table or export logs from several manual runs.
