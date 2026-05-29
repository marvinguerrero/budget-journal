-- ============================================================
-- Migration 020: Personal receivables and payables
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Personal obligations are independent from Shared Budgets.
-- They are user-owned ledger records and do not write income_entries
-- or settlement expenses. Account balances move only on settlement.

CREATE TABLE IF NOT EXISTS public.personal_obligations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction          text NOT NULL CHECK (direction IN ('owed_to_user', 'user_owes')),
  contact_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_name       text NOT NULL,
  contact_email      text,
  amount             numeric(12, 2) NOT NULL CHECK (amount > 0),
  remaining_amount   numeric(12, 2) NOT NULL CHECK (remaining_amount >= 0),
  category           text NOT NULL DEFAULT 'Personal',
  note               text NOT NULL DEFAULT '',
  source_expense_id  uuid REFERENCES expenses(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  settled_at         timestamptz
);

CREATE INDEX IF NOT EXISTS po_user_idx ON public.personal_obligations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS po_contact_user_idx ON public.personal_obligations(contact_user_id);
CREATE INDEX IF NOT EXISTS po_source_expense_idx ON public.personal_obligations(source_expense_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_obligations TO authenticated;

ALTER TABLE public.personal_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_select" ON public.personal_obligations;
DROP POLICY IF EXISTS "po_insert" ON public.personal_obligations;
DROP POLICY IF EXISTS "po_update" ON public.personal_obligations;
DROP POLICY IF EXISTS "po_delete" ON public.personal_obligations;

CREATE POLICY "po_select" ON public.personal_obligations
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "po_insert" ON public.personal_obligations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "po_update" ON public.personal_obligations
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "po_delete" ON public.personal_obligations
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS public.personal_obligation_settlements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id        uuid NOT NULL REFERENCES personal_obligations(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount               numeric(12, 2) NOT NULL CHECK (amount > 0),
  payer_account_id     uuid REFERENCES financial_accounts(id) ON DELETE SET NULL,
  receiver_account_id  uuid REFERENCES financial_accounts(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN ('pending_confirmation', 'confirmed', 'recalled')),
  note                 text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  confirmed_at         timestamptz,
  recalled_at          timestamptz
);

CREATE INDEX IF NOT EXISTS pos_obligation_idx ON public.personal_obligation_settlements(obligation_id);
CREATE INDEX IF NOT EXISTS pos_user_idx ON public.personal_obligation_settlements(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.personal_obligation_settlements TO authenticated;

ALTER TABLE public.personal_obligation_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_select" ON public.personal_obligation_settlements;
DROP POLICY IF EXISTS "pos_insert" ON public.personal_obligation_settlements;
DROP POLICY IF EXISTS "pos_update" ON public.personal_obligation_settlements;

CREATE POLICY "pos_select" ON public.personal_obligation_settlements
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "pos_insert" ON public.personal_obligation_settlements
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "pos_update" ON public.personal_obligation_settlements
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.apply_personal_obligation_payment(
  p_obligation_id uuid,
  p_amount numeric,
  p_account_id uuid DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS personal_obligation_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_obligation personal_obligations;
  v_settlement personal_obligation_settlements;
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_obligation
  FROM personal_obligations
  WHERE id = p_obligation_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation not found'; END IF;
  IF v_obligation.status = 'settled' THEN RAISE EXCEPTION 'Obligation is already settled'; END IF;

  v_amount := LEAST(p_amount, v_obligation.remaining_amount);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Invalid settlement amount'; END IF;

  IF v_obligation.direction = 'user_owes' THEN
    IF p_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance - v_amount
        WHERE id = p_account_id
          AND user_id = v_uid;
    END IF;

    INSERT INTO personal_obligation_settlements (
      obligation_id, user_id, amount, payer_account_id, status, note
    )
    VALUES (
      p_obligation_id, v_uid, v_amount, p_account_id, 'pending_confirmation', COALESCE(p_note, '')
    )
    RETURNING * INTO v_settlement;
  ELSE
    IF p_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance + v_amount
        WHERE id = p_account_id
          AND user_id = v_uid;
    END IF;

    INSERT INTO personal_obligation_settlements (
      obligation_id, user_id, amount, receiver_account_id, status, note, confirmed_at
    )
    VALUES (
      p_obligation_id, v_uid, v_amount, p_account_id, 'confirmed', COALESCE(p_note, ''), now()
    )
    RETURNING * INTO v_settlement;

    UPDATE personal_obligations
      SET remaining_amount = remaining_amount - v_amount,
          status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
          settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE settled_at END
      WHERE id = p_obligation_id
        AND user_id = v_uid;
  END IF;

  RETURN v_settlement;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_personal_obligation_payment(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settlement personal_obligation_settlements;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_settlement
  FROM personal_obligation_settlements
  WHERE id = p_settlement_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_settlement.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Only pending settlements can be confirmed';
  END IF;

  UPDATE personal_obligation_settlements
    SET status = 'confirmed',
        confirmed_at = now()
    WHERE id = p_settlement_id
      AND user_id = v_uid;

  UPDATE personal_obligations
    SET remaining_amount = GREATEST(0, remaining_amount - v_settlement.amount),
        status = CASE WHEN remaining_amount - v_settlement.amount <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN remaining_amount - v_settlement.amount <= 0.005 THEN now() ELSE settled_at END
    WHERE id = v_settlement.obligation_id
      AND user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.recall_personal_obligation_payment(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settlement personal_obligation_settlements;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_settlement
  FROM personal_obligation_settlements
  WHERE id = p_settlement_id
    AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_settlement.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Only pending settlements can be recalled';
  END IF;

  IF v_settlement.payer_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance + v_settlement.amount
      WHERE id = v_settlement.payer_account_id
        AND user_id = v_uid;
  END IF;

  UPDATE personal_obligation_settlements
    SET status = 'recalled',
        recalled_at = now()
    WHERE id = p_settlement_id
      AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_personal_obligation_payment(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_personal_obligation_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recall_personal_obligation_payment(uuid) TO authenticated;
