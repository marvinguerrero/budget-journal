-- ============================================================
-- Migration 064: Performance indexes for high-frequency actions
-- Run this after migration_063.
-- ============================================================
--
-- These indexes support the action flows that are most visible to users:
-- account activity, expense detail lookups, receipt itemization, and
-- settlement review lists. They are intentionally read-path focused and do
-- not change balance behavior.

CREATE INDEX IF NOT EXISTS idx_account_transfers_user_transferred
  ON public.account_transfers(user_id, transferred_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_transfers_from_transferred
  ON public.account_transfers(from_account_id, transferred_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_transfers_to_transferred
  ON public.account_transfers(to_account_id, transferred_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_account_created
  ON public.expenses(account_id, created_at DESC)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_income_entries_account_status_received
  ON public.income_entries(account_id, status, received_at DESC)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_participants_expense_line_item_created
  ON public.expense_participants(expense_id, line_item_id, created_at);

CREATE INDEX IF NOT EXISTS idx_expense_line_items_expense_created
  ON public.expense_line_items(expense_id, created_at);

CREATE INDEX IF NOT EXISTS idx_shared_expense_settlements_payer_created
  ON public.shared_expense_settlements(payer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_expense_settlements_receiver_created
  ON public.shared_expense_settlements(receiver_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_user_created
  ON public.financial_accounts(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_personal_obligation_settlements_payer_created
  ON public.personal_obligation_settlements(payer_account_id, created_at DESC)
  WHERE payer_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_obligation_settlements_receiver_created
  ON public.personal_obligation_settlements(receiver_account_id, created_at DESC)
  WHERE receiver_account_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
