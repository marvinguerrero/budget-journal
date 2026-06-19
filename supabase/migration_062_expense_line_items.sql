-- ============================================================
-- Migration 062: Expense line items (receipt itemization)
-- Run this in the Supabase SQL editor after migration_061.
-- ============================================================
--
-- DESIGN SUMMARY
-- ──────────────
-- The parent `expenses` row remains the sole source of financial
-- truth: it is the ONLY thing that ever deducts from a financial
-- account (via the existing, untouched handle_expense_account_balance
-- trigger). `expense_line_items` is a pure breakdown/explanation
-- layer underneath it — no trigger on this table ever touches
-- financial_accounts.balance.
--
-- Each line item carries the same explicit original/converted FX pair
-- as the parent expense (migration_061): original_amount/original_currency
-- (native units, e.g. ¥) and converted_amount/base_currency (PHP).
-- original_currency and exchange_rate_used default from the parent
-- expense when not supplied; converted_amount is ALWAYS derived
-- server-side (original_amount × exchange_rate_used), never trusted
-- from the client. For a plain PHP expense this defaults to a 1:1
-- rate, so original_amount and converted_amount are identical.
-- ¥2,000 + ¥3,000 + ¥1,500 + ¥3,500 = ¥10,000 sums correctly against
-- a ¥10,000 receipt's original_amount, and the converted_amount sum
-- is validated against the receipt's converted (PHP) amount too.
--
-- "Owe Me" / "I Owe" line items create a personal_obligations row
-- exactly like the existing top-level obligation flow, tagged with
-- source_line_item_id (and source_expense_id left NULL) so the
-- existing getExpenseDetails() query — filtered on source_expense_id
-- — never picks them up and can't be confused with the legacy
-- single-obligation "Balance Information" section.
--
-- "Shared" line items reuse the existing lightweight expense_participants
-- split primitive (equal/custom), tagged with the new line_item_id
-- column. This is scoped to the SAME simple split already used for
-- whole personal expenses — not the full Shared Budget group/settlement
-- system, which would require picking a group and budget item and is
-- out of scope for per-line-item itemization in v1.
-- ============================================================

-- ── 0. Upgrade an already-existing old-schema table, if present ──
-- If an earlier run of this migration already created expense_line_items
-- with the original amount/currency columns, "CREATE TABLE IF NOT EXISTS"
-- below is a no-op and never adds the new FX columns — and CREATE TRIGGER
-- ... OF original_amount would then fail with "column does not exist"
-- (unlike references inside a function body, column names in a trigger's
-- UPDATE OF clause are validated immediately). Detect and upgrade that
-- case here, before either statement runs. Safe to re-run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'expense_line_items'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expense_line_items' AND column_name = 'original_amount'
  ) THEN
    ALTER TABLE public.expense_line_items ADD COLUMN original_amount numeric(14, 2);
    ALTER TABLE public.expense_line_items ADD COLUMN original_currency text;
    ALTER TABLE public.expense_line_items ADD COLUMN converted_amount numeric(14, 2);
    ALTER TABLE public.expense_line_items ADD COLUMN base_currency text NOT NULL DEFAULT 'PHP';
    ALTER TABLE public.expense_line_items ADD COLUMN exchange_rate_used numeric(18, 6);

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expense_line_items' AND column_name = 'amount'
    ) THEN
      UPDATE public.expense_line_items
         SET original_amount = amount,
             original_currency = COALESCE(currency, 'PHP'),
             exchange_rate_used = 1,
             converted_amount = amount;

      -- The old trigger (from the first version of this migration) was
      -- created with "UPDATE OF amount", which Postgres tracks as a hard
      -- dependency — DROP COLUMN amount fails until it's gone.
      DROP TRIGGER IF EXISTS trg_enforce_line_item_allocation ON public.expense_line_items;

      ALTER TABLE public.expense_line_items DROP COLUMN amount;
      ALTER TABLE public.expense_line_items DROP COLUMN currency;
    END IF;

    ALTER TABLE public.expense_line_items ALTER COLUMN original_amount SET NOT NULL;
    ALTER TABLE public.expense_line_items ALTER COLUMN converted_amount SET NOT NULL;
    ALTER TABLE public.expense_line_items ADD CONSTRAINT expense_line_items_original_amount_check CHECK (original_amount > 0);
    ALTER TABLE public.expense_line_items ADD CONSTRAINT expense_line_items_converted_amount_check CHECK (converted_amount > 0);
  END IF;
END $$;

-- ── 1. expense_line_items table ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_line_items (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id           uuid          NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id              uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description          text          NOT NULL CHECK (length(trim(description)) > 0),
  category             text,
  -- Native-currency amount as entered (e.g. ¥2,000). Required from the client.
  original_amount      numeric(14, 2) NOT NULL CHECK (original_amount > 0),
  -- Defaults from the parent expense's original_currency via trigger when omitted.
  original_currency    text,
  -- ALWAYS server-computed (original_amount × exchange_rate_used) — never client-trusted.
  converted_amount     numeric(14, 2) NOT NULL CHECK (converted_amount > 0),
  base_currency        text          NOT NULL DEFAULT 'PHP',
  -- Defaults from the parent expense's exchange_rate_used via trigger when omitted.
  exchange_rate_used   numeric(18, 6),
  assigned_type        text          NOT NULL DEFAULT 'personal'
                                      CHECK (assigned_type IN ('personal', 'owe_me', 'i_owe', 'shared')),
  assigned_contact_id  uuid          REFERENCES public.contacts(id) ON DELETE SET NULL,
  obligation_id        uuid          REFERENCES public.personal_obligations(id) ON DELETE SET NULL,
  notes                text          NOT NULL DEFAULT '',
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_line_items_expense ON public.expense_line_items(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_line_items_user    ON public.expense_line_items(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_line_items TO authenticated;

ALTER TABLE public.expense_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eli_select" ON public.expense_line_items;
DROP POLICY IF EXISTS "eli_insert" ON public.expense_line_items;
DROP POLICY IF EXISTS "eli_update" ON public.expense_line_items;
DROP POLICY IF EXISTS "eli_delete" ON public.expense_line_items;

CREATE POLICY "eli_select" ON public.expense_line_items FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "eli_insert" ON public.expense_line_items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "eli_update" ON public.expense_line_items FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "eli_delete" ON public.expense_line_items FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_expense_line_item_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_line_items_updated_at ON public.expense_line_items;
CREATE TRIGGER trg_expense_line_items_updated_at
  BEFORE UPDATE ON public.expense_line_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_expense_line_item_updated_at();

-- ── 2. Link columns on existing tables ─────────────────────────
ALTER TABLE public.personal_obligations
  ADD COLUMN IF NOT EXISTS source_line_item_id uuid REFERENCES public.expense_line_items(id) ON DELETE SET NULL;

ALTER TABLE public.expense_participants
  ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES public.expense_line_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_personal_obligations_line_item ON public.personal_obligations(source_line_item_id);
CREATE INDEX IF NOT EXISTS idx_expense_participants_line_item ON public.expense_participants(line_item_id);

-- ── 3. Currency conversion + over-allocation protection ─────────
-- Rules implemented here (BEFORE INSERT/UPDATE, so they apply no
-- matter how the row is written):
--   1. original_currency defaults from the parent's original_currency.
--   2. exchange_rate_used defaults from the parent's exchange_rate_used.
--   3. converted_amount is always derived: original_amount × exchange_rate_used.
--   4. Sum of original_amount across all line items must not exceed
--      the parent's native amount (small epsilon for FP rounding).
--   5. Sum of converted_amount must not exceed the parent's converted
--      (PHP) amount — a slightly looser tolerance, since rounding
--      compounds more after the multiply than on the native side.
CREATE OR REPLACE FUNCTION public.compute_and_validate_line_item_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses;
  v_native_total numeric;
  v_other_original_total numeric;
  v_other_converted_total numeric;
BEGIN
  SELECT * INTO v_expense FROM expenses WHERE id = NEW.expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent expense not found.'; END IF;

  -- Rules 1 & 2: default currency/rate from the parent expense.
  NEW.original_currency := COALESCE(NEW.original_currency, v_expense.original_currency, 'PHP');
  NEW.exchange_rate_used := COALESCE(NEW.exchange_rate_used, v_expense.exchange_rate_used, 1);
  NEW.base_currency := 'PHP';

  -- Rule 3: converted_amount is always derived, never trusted from the client.
  NEW.converted_amount := round(NEW.original_amount * NEW.exchange_rate_used, 2);

  -- Rule 4: native-amount allocation.
  v_native_total := COALESCE(v_expense.original_amount, v_expense.amount);

  SELECT COALESCE(SUM(original_amount), 0) INTO v_other_original_total
  FROM expense_line_items
  WHERE expense_id = NEW.expense_id AND id <> NEW.id;

  IF v_other_original_total + NEW.original_amount > v_native_total + 0.01 THEN
    RAISE EXCEPTION 'Line items total (%) would exceed the receipt amount (%).',
      round(v_other_original_total + NEW.original_amount, 2), round(v_native_total, 2);
  END IF;

  -- Rule 5: converted (PHP) amount allocation, looser rounding tolerance.
  SELECT COALESCE(SUM(converted_amount), 0) INTO v_other_converted_total
  FROM expense_line_items
  WHERE expense_id = NEW.expense_id AND id <> NEW.id;

  IF v_other_converted_total + NEW.converted_amount > v_expense.amount + 0.05 THEN
    RAISE EXCEPTION 'Converted line items total (₱%) would exceed the receipt''s converted amount (₱%).',
      round(v_other_converted_total + NEW.converted_amount, 2), round(v_expense.amount, 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_line_item_allocation ON public.expense_line_items;
DROP TRIGGER IF EXISTS trg_compute_and_validate_line_item_allocation ON public.expense_line_items;
CREATE TRIGGER trg_compute_and_validate_line_item_allocation
  BEFORE INSERT OR UPDATE OF original_amount, exchange_rate_used, expense_id ON public.expense_line_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_and_validate_line_item_allocation();

-- ── 4. Block deletion once settlement activity exists ──────────
-- Conservative v1 rule: a line item's generated obligation (direct,
-- or via its participants) must have no settlement history and no
-- registered-contact counterparty relationship before it can be
-- deleted — mirrors the spirit of migration_035's expense-level
-- guard, applied at line-item granularity.
CREATE OR REPLACE FUNCTION public.line_item_has_settlement_activity(p_line_item_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH linked_obligations AS (
    SELECT po.id, po.status, po.counterparty_obligation_id, po.relationship_id
    FROM personal_obligations po
    WHERE po.source_line_item_id = p_line_item_id
       OR po.id IN (
         SELECT obligation_id FROM expense_participants
         WHERE line_item_id = p_line_item_id AND obligation_id IS NOT NULL
       )
  )
  SELECT EXISTS (
    SELECT 1 FROM linked_obligations
    WHERE status = 'settled'
       OR counterparty_obligation_id IS NOT NULL
       OR relationship_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1 FROM personal_obligation_settlements pos
    WHERE pos.obligation_id IN (SELECT id FROM linked_obligations)
  );
$$;

CREATE OR REPLACE FUNCTION public.block_line_item_delete_with_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.line_item_has_settlement_activity(OLD.id) THEN
    RAISE EXCEPTION 'This line item cannot be deleted because settlement activity already exists. Resolve the debt first.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_line_item_delete_with_activity ON public.expense_line_items;
CREATE TRIGGER trg_block_line_item_delete_with_activity
  BEFORE DELETE ON public.expense_line_items
  FOR EACH ROW EXECUTE FUNCTION public.block_line_item_delete_with_activity();

GRANT EXECUTE ON FUNCTION public.line_item_has_settlement_activity(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
