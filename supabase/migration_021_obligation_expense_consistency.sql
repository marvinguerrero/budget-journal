-- ============================================================
-- Migration 021: Keep expense-derived obligations synchronized
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Personal "Owe Me" obligations are derived from a source expense.
-- If the source expense is deleted, the obligation and its settlement
-- activity should disappear too. If the source expense amount/category/note
-- changes, the obligation should follow it.

ALTER TABLE public.personal_obligations
  DROP CONSTRAINT IF EXISTS personal_obligations_source_expense_id_fkey;

ALTER TABLE public.personal_obligations
  ADD CONSTRAINT personal_obligations_source_expense_id_fkey
  FOREIGN KEY (source_expense_id)
  REFERENCES public.expenses(id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS po_source_expense_unique_idx
  ON public.personal_obligations(source_expense_id)
  WHERE source_expense_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_personal_obligation_from_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obligation personal_obligations;
  v_delta numeric(12, 2);
  v_remaining numeric(12, 2);
BEGIN
  SELECT * INTO v_obligation
  FROM personal_obligations
  WHERE source_expense_id = NEW.id
    AND user_id = NEW.user_id
    AND direction = 'owed_to_user';

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_delta := NEW.amount - OLD.amount;
  v_remaining := GREATEST(0, v_obligation.remaining_amount + v_delta);

  UPDATE personal_obligations
    SET amount = NEW.amount,
        remaining_amount = v_remaining,
        category = NEW.category,
        note = NEW.note,
        status = CASE WHEN v_remaining <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN v_remaining <= 0.005 THEN COALESCE(settled_at, now()) ELSE NULL END
    WHERE id = v_obligation.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_personal_obligation_from_expense ON public.expenses;
CREATE TRIGGER trg_sync_personal_obligation_from_expense
  AFTER UPDATE OF amount, category, note ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.sync_personal_obligation_from_expense();

-- Shared expense splits already use ON DELETE CASCADE, so deleting the source
-- shared expense removes split-derived receivable/payable rows. Pending shared
-- settlements can become stale after shared expense edits/deletes, so cancel
-- them and reverse any payer account movement tied to those pending payments.

CREATE OR REPLACE FUNCTION public.cancel_pending_shared_settlements(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s shared_expense_settlements;
BEGIN
  FOR v_s IN
    SELECT *
    FROM shared_expense_settlements
    WHERE group_id = p_group_id
      AND status = 'pending_confirmation'
  LOOP
    IF v_s.expense_id IS NOT NULL THEN
      DELETE FROM expenses WHERE id = v_s.expense_id;
    END IF;

    UPDATE shared_expense_settlements
      SET status = 'recalled'
      WHERE id = v_s.id;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.update_shared_expense(uuid, text, numeric, text, uuid, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.update_shared_expense(
  p_expense_id            uuid,
  p_category              text,
  p_amount                numeric,
  p_note                  text,
  p_paid_by_user_id       uuid DEFAULT NULL,
  p_paid_by_email         text DEFAULT '',
  p_split_mode            text DEFAULT 'equal',
  p_account_id            uuid DEFAULT NULL,
  p_payment_source_status text DEFAULT 'confirmed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense shared_expenses;
  v_owner uuid;
BEGIN
  SELECT * INTO v_expense FROM shared_expenses WHERE id = p_expense_id;
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

  PERFORM public.cancel_pending_shared_settlements(v_expense.group_id);

  UPDATE shared_expenses
    SET category = p_category,
        amount = p_amount,
        note = p_note,
        paid_by_user_id = COALESCE(p_paid_by_user_id, user_id),
        paid_by_email = CASE WHEN p_paid_by_email = '' THEN user_email ELSE p_paid_by_email END,
        split_mode = p_split_mode,
        account_id = p_account_id,
        payment_source_status = p_payment_source_status
    WHERE id = p_expense_id;
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
  SELECT * INTO v_expense FROM shared_expenses WHERE id = p_expense_id;
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

  DELETE FROM shared_expenses WHERE id = p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_personal_obligation_from_expense() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pending_shared_settlements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_shared_expense(uuid, text, numeric, text, uuid, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shared_expense_consistent(uuid) TO authenticated;
