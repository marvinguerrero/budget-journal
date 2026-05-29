-- ============================================================
-- Migration 019: Allow budget-edit members to upsert shared budgets
-- Run this in the Supabase SQL editor.
-- ============================================================

-- The frontend grants shared budget add/edit/delete UI to:
--   1. group owners
--   2. members with shared_group_members.can_edit_budget = true
--
-- Previous shared_budgets RLS write policies allowed only owners,
-- causing budget-edit members to receive 403 Forbidden on upsert.

CREATE OR REPLACE FUNCTION public.can_edit_shared_budget(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM shared_groups
      WHERE id = p_group_id
        AND owner_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM shared_group_members
      WHERE group_id = p_group_id
        AND user_id = (select auth.uid())
        AND can_edit_budget = true
    );
$$;

DROP POLICY IF EXISTS "sb_insert" ON shared_budgets;
DROP POLICY IF EXISTS "sb_update" ON shared_budgets;
DROP POLICY IF EXISTS "sb_delete" ON shared_budgets;

CREATE POLICY "sb_insert" ON shared_budgets
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_shared_budget(group_id));

CREATE POLICY "sb_update" ON shared_budgets
  FOR UPDATE TO authenticated
  USING (public.can_edit_shared_budget(group_id))
  WITH CHECK (public.can_edit_shared_budget(group_id));

CREATE POLICY "sb_delete" ON shared_budgets
  FOR DELETE TO authenticated
  USING (public.can_edit_shared_budget(group_id));
