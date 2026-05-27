-- ============================================================
-- Migration 010: Internal Account Transfers
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. account_transfers ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_transfers (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id  uuid          NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  to_account_id    uuid          NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  amount           numeric(14,2) NOT NULL CHECK (amount > 0),
  note             text          NOT NULL DEFAULT '',
  transferred_at   timestamptz   NOT NULL DEFAULT now(),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT different_accounts CHECK (from_account_id <> to_account_id)
);

CREATE INDEX IF NOT EXISTS idx_account_transfers_user
  ON account_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_account_transfers_from
  ON account_transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_account_transfers_to
  ON account_transfers(to_account_id);

GRANT SELECT, INSERT, DELETE ON account_transfers TO authenticated;
ALTER TABLE account_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "at_select" ON account_transfers;
DROP POLICY IF EXISTS "at_insert" ON account_transfers;
DROP POLICY IF EXISTS "at_delete" ON account_transfers;

CREATE POLICY "at_select" ON account_transfers
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "at_insert" ON account_transfers
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "at_delete" ON account_transfers
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- ── 2. Balance trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_transfer_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE financial_accounts SET balance = balance - NEW.amount WHERE id = NEW.from_account_id;
    UPDATE financial_accounts SET balance = balance + NEW.amount WHERE id = NEW.to_account_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE financial_accounts SET balance = balance + OLD.amount WHERE id = OLD.from_account_id;
    UPDATE financial_accounts SET balance = balance - OLD.amount WHERE id = OLD.to_account_id;

  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_transfer_balance ON account_transfers;
CREATE TRIGGER trg_transfer_balance
  AFTER INSERT OR DELETE ON account_transfers
  FOR EACH ROW EXECUTE FUNCTION handle_transfer_balance();
