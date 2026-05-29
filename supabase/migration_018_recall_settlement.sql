-- ============================================================
-- Migration 018: Recall (cancel) pending settlement
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. Allow 'recalled' as a valid settlement status ─────────
ALTER TABLE shared_expense_settlements
  DROP CONSTRAINT IF EXISTS shared_expense_settlements_status_check;

ALTER TABLE shared_expense_settlements
  ADD CONSTRAINT shared_expense_settlements_status_check
  CHECK (status IN ('pending_confirmation', 'confirmed', 'rejected', 'recalled'));

-- ── 2. recall_settlement RPC ──────────────────────────────────
-- Called by the payer before the receiver confirms.
-- Deletes the linked expense (restoring account balance via the
-- existing shared_expense_account_balance_trigger) and marks
-- the settlement as recalled.
CREATE OR REPLACE FUNCTION public.recall_settlement(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s shared_expense_settlements;
BEGIN
  SELECT * INTO v_s FROM shared_expense_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;

  IF v_s.payer_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the payer can recall a settlement';
  END IF;

  IF v_s.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Only pending settlements can be recalled';
  END IF;

  -- Delete the payer's expense so the balance trigger restores their account
  IF v_s.expense_id IS NOT NULL THEN
    DELETE FROM expenses WHERE id = v_s.expense_id;
  END IF;

  UPDATE shared_expense_settlements
     SET status = 'recalled'
   WHERE id = p_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recall_settlement(uuid) TO authenticated;
