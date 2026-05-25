-- ============================================================
-- Migration 001 – Payment Methods table
-- Run this in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '💳',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_payment_methods_user_id ON public.payment_methods(user_id);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own and default payment methods"
  ON public.payment_methods FOR SELECT
  USING (auth.uid() = user_id OR is_default = TRUE);

CREATE POLICY "Users can insert own payment methods"
  ON public.payment_methods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own payment methods"
  ON public.payment_methods FOR UPDATE
  USING (auth.uid() = user_id AND is_default = FALSE);

CREATE POLICY "Users can delete own payment methods"
  ON public.payment_methods FOR DELETE
  USING (auth.uid() = user_id AND is_default = FALSE);

-- Seed defaults
INSERT INTO public.payment_methods (user_id, name, emoji, is_default) VALUES
  (NULL, 'Cash',          '💵', TRUE),
  (NULL, 'Credit Card',   '💳', TRUE),
  (NULL, 'Debit Card',    '💳', TRUE),
  (NULL, 'GCash',         '📱', TRUE),
  (NULL, 'Maya',          '💸', TRUE),
  (NULL, 'Bank Transfer', '🏦', TRUE)
ON CONFLICT DO NOTHING;
