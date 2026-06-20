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

CREATE INDEX IF NOT EXISTS idx_expenses_user_receipt_created
  ON public.expenses(user_id, has_receipt, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_user_currency_created
  ON public.expenses(user_id, original_currency, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_user_shared_status_created
  ON public.expenses(user_id, is_shared_budget_expense, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON public.notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_expenses_group_created
  ON public.shared_expenses(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_expenses_group_budget_created
  ON public.shared_expenses(group_id, shared_budget_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_expense_splits_expense_debtor
  ON public.shared_expense_splits(expense_id, debtor_user_id);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_status_created
  ON public.wishlist_items(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wishlist_shares_recipient_active_created
  ON public.wishlist_shares(recipient_user_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_obligation_settlements_payer_created
  ON public.personal_obligation_settlements(payer_account_id, created_at DESC)
  WHERE payer_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_obligation_settlements_receiver_created
  ON public.personal_obligation_settlements(receiver_account_id, created_at DESC)
  WHERE receiver_account_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
