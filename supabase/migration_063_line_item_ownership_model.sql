-- ============================================================
-- Migration 063: Receipt line item ownership model
-- Run this in the Supabase SQL editor after migration_062.
-- ============================================================
--
-- DESIGN SUMMARY
-- ──────────────
-- Replaces manual Personal/Owe Me/I Owe/Shared classification with
-- three business facts per line item:
--   owner          — who ultimately owns/uses/consumes the item
--   payer          — who is responsible for paying for it
--   shouldered_by  — who initially fronted the money for it
--
-- A trigger derives `derived_status` from comparing the three:
--   payer = shouldered_by, owner = payer        → 'personal'  (no obligation)
--   payer = shouldered_by, owner != payer        → 'gift'      (no obligation)
--   payer != shouldered_by, owner = payer        → 'receivable' or 'payable'
--     (label depends on which side is the CURRENT user — see service layer)
--   owner != payer AND payer != shouldered_by    → 'shared'
--     (three distinct parties; no worked example in spec for this combo,
--      so no obligation is auto-created — surfaced for manual handling)
--
-- This trigger ONLY computes the display/export status column. Actual
-- personal_obligations creation continues to happen in the TypeScript
-- service layer (services/expenseLineItems.ts), consistent with every
-- other obligation-creation path in this app (createExpense,
-- replaceExpenseParticipants, createObligationForContact) — keeping
-- that logic in one place rather than duplicating it in SQL.
--
-- The old assigned_type/assigned_contact_id columns from migration_062
-- are left in place (harmless, already defaulted) but are no longer
-- driven by the UI — derived_status supersedes them for display.
--
-- The existing multi-person "Shared" split flow (expense_participants
-- with line_item_id, equal/custom split) is UNCHANGED and remains the
-- integration point for the spec's "Owner can be multiple people"
-- future-scoped case — selecting that mode still uses participants,
-- independent of these three new single-person fields.
-- ============================================================

-- ── 1. Ownership columns ────────────────────────────────────────
-- Each role mirrors the existing participant_kind pattern already
-- used elsewhere in this app (self / contact / external), so the UI
-- can reuse the same contact-picker component for all three roles.
ALTER TABLE public.expense_line_items
  ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'self'
    CHECK (owner_kind IN ('self', 'contact', 'external')),
  ADD COLUMN IF NOT EXISTS owner_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_email text,

  ADD COLUMN IF NOT EXISTS payer_kind text NOT NULL DEFAULT 'self'
    CHECK (payer_kind IN ('self', 'contact', 'external')),
  ADD COLUMN IF NOT EXISTS payer_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS payer_email text,

  ADD COLUMN IF NOT EXISTS shouldered_by_kind text NOT NULL DEFAULT 'self'
    CHECK (shouldered_by_kind IN ('self', 'contact', 'external')),
  ADD COLUMN IF NOT EXISTS shouldered_by_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shouldered_by_name text,
  ADD COLUMN IF NOT EXISTS shouldered_by_email text,

  ADD COLUMN IF NOT EXISTS derived_status text NOT NULL DEFAULT 'personal'
    CHECK (derived_status IN ('personal', 'receivable', 'payable', 'gift', 'shared'));

-- ── 2. Backfill existing rows from the old assigned_type ────────
-- Safe to re-run: only touches rows that still look untouched by the
-- new model (owner/payer/shouldered_by all still at their 'self'
-- defaults, i.e. never explicitly set).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expense_line_items' AND column_name = 'assigned_type'
  ) THEN
    -- owe_me: the assigned contact owned/paid for it; I (self) shouldered it.
    UPDATE public.expense_line_items eli
       SET owner_kind = 'contact', owner_contact_id = eli.assigned_contact_id,
           owner_name = c.name, owner_email = c.email,
           payer_kind = 'contact', payer_contact_id = eli.assigned_contact_id,
           payer_name = c.name, payer_email = c.email,
           shouldered_by_kind = 'self'
      FROM public.contacts c
     WHERE c.id = eli.assigned_contact_id
       AND eli.assigned_type = 'owe_me'
       AND eli.owner_kind = 'self' AND eli.payer_kind = 'self' AND eli.shouldered_by_kind = 'self';

    -- i_owe: I (self) own/am responsible; the assigned contact shouldered it.
    UPDATE public.expense_line_items eli
       SET shouldered_by_kind = 'contact', shouldered_by_contact_id = eli.assigned_contact_id,
           shouldered_by_name = c.name, shouldered_by_email = c.email
      FROM public.contacts c
     WHERE c.id = eli.assigned_contact_id
       AND eli.assigned_type = 'i_owe'
       AND eli.owner_kind = 'self' AND eli.payer_kind = 'self' AND eli.shouldered_by_kind = 'self';

    -- personal / shared: owner=payer=shouldered_by=self is already the
    -- column default, so no row needs touching for those.
  END IF;
END $$;

-- ── 3. Derive status from owner/payer/shouldered_by ──────────────
-- Identity comparison per role: 'self' compares equal to 'self' only;
-- a contact compares by contact_id; an external person compares by
-- lower(trim(name)) since there's no stable id for them (documented
-- limitation — two different external people sharing a name string
-- are treated as the same person by this heuristic; use Contacts for
-- anyone who needs precise tracking).
CREATE OR REPLACE FUNCTION public.compute_line_item_derived_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner text;
  v_payer text;
  v_shouldered text;
BEGIN
  v_owner := CASE NEW.owner_kind
    WHEN 'self' THEN 'self'
    WHEN 'contact' THEN 'contact:' || COALESCE(NEW.owner_contact_id::text, '')
    ELSE 'external:' || lower(trim(COALESCE(NEW.owner_name, '')))
  END;
  v_payer := CASE NEW.payer_kind
    WHEN 'self' THEN 'self'
    WHEN 'contact' THEN 'contact:' || COALESCE(NEW.payer_contact_id::text, '')
    ELSE 'external:' || lower(trim(COALESCE(NEW.payer_name, '')))
  END;
  v_shouldered := CASE NEW.shouldered_by_kind
    WHEN 'self' THEN 'self'
    WHEN 'contact' THEN 'contact:' || COALESCE(NEW.shouldered_by_contact_id::text, '')
    ELSE 'external:' || lower(trim(COALESCE(NEW.shouldered_by_name, '')))
  END;

  IF v_payer = v_shouldered THEN
    NEW.derived_status := CASE WHEN v_owner = v_payer THEN 'personal' ELSE 'gift' END;
  ELSIF v_owner = v_payer THEN
    NEW.derived_status := CASE
      WHEN v_owner = 'self' THEN 'payable'
      WHEN v_shouldered = 'self' THEN 'receivable'
      ELSE 'shared' -- owner/payer match each other but neither side is "self"
    END;
  ELSE
    NEW.derived_status := 'shared'; -- three distinct parties; no rule defined, no auto-obligation
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_line_item_derived_status ON public.expense_line_items;
CREATE TRIGGER trg_compute_line_item_derived_status
  BEFORE INSERT OR UPDATE OF owner_kind, owner_contact_id, owner_name,
    payer_kind, payer_contact_id, payer_name,
    shouldered_by_kind, shouldered_by_contact_id, shouldered_by_name
  ON public.expense_line_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_line_item_derived_status();

-- Recompute derived_status for the rows backfilled in step 2 (the trigger
-- only fires on INSERT/UPDATE of the listed columns, and step 2's UPDATE
-- already touched them, so this is mostly a no-op safety net for rows
-- that existed before this migration ran at all).
UPDATE public.expense_line_items SET owner_kind = owner_kind;

NOTIFY pgrst, 'reload schema';
