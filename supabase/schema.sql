-- ============================================================
-- Budget Journal – Supabase PostgreSQL Schema
-- ============================================================

-- Enable Row Level Security (RLS) for all tables

-- ──────────────────────────────────────────────────────────────
-- EXPENSES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category      TEXT NOT NULL DEFAULT 'Others',
  note          TEXT NOT NULL DEFAULT '',
  payment_method TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_user_id         ON public.expenses(user_id);
CREATE INDEX idx_expenses_created_at      ON public.expenses(created_at DESC);
CREATE INDEX idx_expenses_user_created    ON public.expenses(user_id, created_at DESC);
CREATE INDEX idx_expenses_category        ON public.expenses(user_id, category);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own expenses"
  ON public.expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses"
  ON public.expenses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses"
  ON public.expenses FOR DELETE
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────
-- BUDGETS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budgets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  amount     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  month      SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year       SMALLINT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category, month, year)
);

CREATE INDEX idx_budgets_user_month ON public.budgets(user_id, month, year);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budgets"
  ON public.budgets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budgets"
  ON public.budgets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets"
  ON public.budgets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets"
  ON public.budgets FOR DELETE
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────
-- CATEGORIES (optional custom categories)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '📦',
  color      TEXT NOT NULL DEFAULT '#6B7280',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_categories_user_id ON public.categories(user_id);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own and default categories"
  ON public.categories FOR SELECT
  USING (auth.uid() = user_id OR is_default = TRUE);

CREATE POLICY "Users can insert own categories"
  ON public.categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON public.categories FOR UPDATE
  USING (auth.uid() = user_id AND is_default = FALSE);

CREATE POLICY "Users can delete own categories"
  ON public.categories FOR DELETE
  USING (auth.uid() = user_id AND is_default = FALSE);

-- ──────────────────────────────────────────────────────────────
-- SEED: Default categories (global, no user_id)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.categories (user_id, name, icon, color, is_default) VALUES
  (NULL, 'Food',           '🍜', '#F97316', TRUE),
  (NULL, 'Transportation', '🚗', '#3B82F6', TRUE),
  (NULL, 'Bills',          '📄', '#EF4444', TRUE),
  (NULL, 'Shopping',       '🛍️', '#A855F7', TRUE),
  (NULL, 'Entertainment',  '🎬', '#EC4899', TRUE),
  (NULL, 'Health',         '💊', '#10B981', TRUE),
  (NULL, 'Others',         '📦', '#6B7280', TRUE)
ON CONFLICT DO NOTHING;
