-- ============================================================
-- Migration 011: Asset / Liability account categories + Loan type
-- Run this in the Supabase SQL editor AFTER migration_009.
-- ============================================================

-- ── 1. Add category column ────────────────────────────────────
ALTER TABLE financial_accounts
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'asset'
    CHECK (category IN ('asset', 'liability'));

-- ── 2. Extend the type CHECK to include 'loan' ────────────────
-- Drop the auto-named constraint (PostgreSQL generates
-- "financial_accounts_type_check" for inline CHECK clauses).
ALTER TABLE financial_accounts
  DROP CONSTRAINT IF EXISTS financial_accounts_type_check;

ALTER TABLE financial_accounts
  ADD CONSTRAINT financial_accounts_type_check
  CHECK (type IN ('cash','bank','ewallet','credit','savings','investment','loan'));

-- ── 3. Backfill category for existing accounts ────────────────
UPDATE financial_accounts
  SET category = 'liability'
  WHERE type IN ('credit', 'loan');

UPDATE financial_accounts
  SET category = 'asset'
  WHERE type NOT IN ('credit', 'loan');
