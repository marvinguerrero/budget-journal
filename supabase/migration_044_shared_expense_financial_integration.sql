-- ============================================================
-- Migration 044: Shared expense financial integration
-- Run this in the Supabase SQL editor after migration 043.
-- ============================================================

-- Shared expenses remain the shared/split record. A linked row in expenses is
-- the canonical financial record for account balances, expense totals, reports,
-- and account activity.

ALTER TABLE public.shared_expenses
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS shared_expense_id uuid REFERENCES public.shared_expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_group_id uuid REFERENCES public.shared_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_budget_id uuid REFERENCES public.shared_budgets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_budget_item text,
  ADD COLUMN IF NOT EXISTS is_shared_budget_expense boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS shared_expenses_expense_unique_idx
  ON public.shared_expenses(expense_id)
  WHERE expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shared_expenses_expense_idx
  ON public.shared_expenses(expense_id)
  WHERE expense_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_shared_expense_unique_idx
  ON public.expenses(shared_expense_id)
  WHERE shared_expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS expenses_shared_group_idx
  ON public.expenses(shared_group_id)
  WHERE shared_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS expenses_shared_budget_idx
  ON public.expenses(shared_budget_id)
  WHERE shared_budget_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_shared_expense_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expense_id IS NULL AND NEW.account_id IS NOT NULL THEN
      UPDATE financial_accounts
         SET balance = balance - NEW.amount
       WHERE id = NEW.account_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.expense_id IS NULL AND OLD.account_id IS NOT NULL THEN
      UPDATE financial_accounts
         SET balance = balance + OLD.amount
       WHERE id = OLD.account_id;
    END IF;

    IF NEW.expense_id IS NULL AND NEW.account_id IS NOT NULL THEN
      UPDATE financial_accounts
         SET balance = balance - NEW.amount
       WHERE id = NEW.account_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.expense_id IS NULL AND OLD.account_id IS NOT NULL THEN
      UPDATE financial_accounts
         SET balance = balance + OLD.amount
       WHERE id = OLD.account_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP FUNCTION IF EXISTS public.confirm_payment_source(uuid, uuid);

CREATE OR REPLACE FUNCTION public.confirm_payment_source(
  p_expense_id uuid,
  p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_e shared_expenses;
  v_budget shared_budgets;
  v_canonical_expense_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'Please select a source account.'; END IF;

  SELECT * INTO v_e
  FROM shared_expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF v_e.paid_by_user_id != v_uid THEN
    RAISE EXCEPTION 'Only the payer can confirm the payment source';
  END IF;
  IF v_e.payment_source_status != 'pending' THEN
    RAISE EXCEPTION 'Payment source already confirmed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM financial_accounts
    WHERE id = p_account_id
      AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Source account not found';
  END IF;

  SELECT * INTO v_budget
  FROM shared_budgets
  WHERE id = v_e.shared_budget_id;

  IF v_e.expense_id IS NULL THEN
    INSERT INTO expenses (
      user_id,
      amount,
      category,
      note,
      account_id,
      created_at,
      shared_expense_id,
      shared_group_id,
      shared_budget_id,
      shared_budget_item,
      is_shared_budget_expense
    )
    VALUES (
      v_uid,
      v_e.amount,
      COALESCE(v_budget.category, v_e.category),
      v_e.note,
      p_account_id,
      v_e.created_at,
      v_e.id,
      v_e.group_id,
      v_e.shared_budget_id,
      v_budget.item,
      true
    )
    RETURNING id INTO v_canonical_expense_id;
  ELSE
    v_canonical_expense_id := v_e.expense_id;

    UPDATE expenses
      SET amount = v_e.amount,
          category = COALESCE(v_budget.category, v_e.category),
          note = v_e.note,
          account_id = p_account_id,
          shared_expense_id = v_e.id,
          shared_group_id = v_e.group_id,
          shared_budget_id = v_e.shared_budget_id,
          shared_budget_item = v_budget.item,
          is_shared_budget_expense = true
      WHERE id = v_e.expense_id
        AND user_id = v_uid;
  END IF;

  UPDATE shared_expenses
     SET expense_id = v_canonical_expense_id,
         account_id = p_account_id,
         payment_source_status = 'confirmed'
   WHERE id = p_expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_shared_expense(
  p_expense_id            uuid,
  p_category              text,
  p_amount                numeric,
  p_note                  text,
  p_paid_by_user_id       uuid DEFAULT NULL,
  p_paid_by_email         text DEFAULT '',
  p_split_mode            text DEFAULT 'equal',
  p_account_id            uuid DEFAULT NULL,
  p_payment_source_status text DEFAULT 'confirmed',
  p_shared_budget_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense shared_expenses;
  v_owner uuid;
  v_budget shared_budgets;
BEGIN
  SELECT * INTO v_expense FROM shared_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = v_expense.group_id;

  IF v_expense.user_id != auth.uid()
    AND v_owner != auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM shared_group_members
      WHERE group_id = v_expense.group_id
        AND user_id = auth.uid()
        AND can_edit_budget = true
    )
  THEN
    RAISE EXCEPTION 'You do not have permission to edit this expense';
  END IF;

  IF p_shared_budget_id IS NULL THEN
    RAISE EXCEPTION 'Budget item is required';
  END IF;

  SELECT * INTO v_budget
  FROM shared_budgets
  WHERE id = p_shared_budget_id
    AND group_id = v_expense.group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget item not found';
  END IF;

  PERFORM public.cancel_pending_shared_settlements(v_expense.group_id);

  UPDATE shared_expenses
    SET category = v_budget.category,
        shared_budget_id = p_shared_budget_id,
        amount = p_amount,
        note = p_note,
        paid_by_user_id = COALESCE(p_paid_by_user_id, user_id),
        paid_by_email = CASE WHEN p_paid_by_email = '' THEN user_email ELSE p_paid_by_email END,
        split_mode = p_split_mode,
        account_id = p_account_id,
        payment_source_status = p_payment_source_status
    WHERE id = p_expense_id;

  IF v_expense.expense_id IS NOT NULL THEN
    IF p_payment_source_status = 'confirmed' AND p_account_id IS NOT NULL THEN
      UPDATE expenses
        SET amount = p_amount,
            category = v_budget.category,
            note = p_note,
            account_id = p_account_id,
            shared_group_id = v_expense.group_id,
            shared_budget_id = p_shared_budget_id,
            shared_budget_item = v_budget.item,
            is_shared_budget_expense = true
        WHERE id = v_expense.expense_id;
    ELSE
      UPDATE shared_expenses
        SET expense_id = NULL,
            account_id = NULL
        WHERE id = p_expense_id;

      DELETE FROM expenses
      WHERE id = v_expense.expense_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_shared_expense_consistent(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense shared_expenses;
  v_owner uuid;
BEGIN
  SELECT * INTO v_expense
  FROM shared_expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT owner_id INTO v_owner FROM shared_groups WHERE id = v_expense.group_id;

  IF v_expense.user_id != auth.uid()
    AND v_owner != auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM shared_group_members
      WHERE group_id = v_expense.group_id
        AND user_id = auth.uid()
        AND can_edit_budget = true
    )
  THEN
    RAISE EXCEPTION 'You do not have permission to delete this expense';
  END IF;

  PERFORM public.cancel_pending_shared_settlements(v_expense.group_id);

  DELETE FROM shared_expenses
  WHERE id = p_expense_id;

  IF v_expense.expense_id IS NOT NULL THEN
    DELETE FROM expenses
    WHERE id = v_expense.expense_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_payment_source(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_shared_expense(uuid, text, numeric, text, uuid, text, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shared_expense_consistent(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
