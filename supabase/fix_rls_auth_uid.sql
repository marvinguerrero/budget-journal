-- ============================================================
-- Fix: wrap auth.uid() in (select ...) for correct RLS evaluation
-- Run this in the Supabase SQL editor.
-- ============================================================

-- shared_groups
DROP POLICY IF EXISTS "sg_select" ON shared_groups;
DROP POLICY IF EXISTS "sg_insert" ON shared_groups;
DROP POLICY IF EXISTS "sg_update" ON shared_groups;
DROP POLICY IF EXISTS "sg_delete" ON shared_groups;

CREATE POLICY "sg_select" ON shared_groups
  FOR SELECT TO authenticated USING (is_group_member_or_owner(id));

CREATE POLICY "sg_insert" ON shared_groups
  FOR INSERT TO authenticated WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY "sg_update" ON shared_groups
  FOR UPDATE TO authenticated USING (owner_id = (select auth.uid()));

CREATE POLICY "sg_delete" ON shared_groups
  FOR DELETE TO authenticated USING (owner_id = (select auth.uid()));

-- shared_group_members
DROP POLICY IF EXISTS "sgm_select" ON shared_group_members;
DROP POLICY IF EXISTS "sgm_insert" ON shared_group_members;
DROP POLICY IF EXISTS "sgm_delete" ON shared_group_members;

CREATE POLICY "sgm_select" ON shared_group_members
  FOR SELECT TO authenticated USING (is_group_member_or_owner(group_id));

CREATE POLICY "sgm_insert" ON shared_group_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = (select auth.uid())
  ));

CREATE POLICY "sgm_delete" ON shared_group_members
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = (select auth.uid()))
  );

-- shared_budgets
DROP POLICY IF EXISTS "sb_select" ON shared_budgets;
DROP POLICY IF EXISTS "sb_insert" ON shared_budgets;
DROP POLICY IF EXISTS "sb_update" ON shared_budgets;
DROP POLICY IF EXISTS "sb_delete" ON shared_budgets;

CREATE POLICY "sb_select" ON shared_budgets
  FOR SELECT TO authenticated USING (is_group_member_or_owner(group_id));

CREATE POLICY "sb_insert" ON shared_budgets
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = (select auth.uid())
  ));

CREATE POLICY "sb_update" ON shared_budgets
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = (select auth.uid())
  ));

CREATE POLICY "sb_delete" ON shared_budgets
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = (select auth.uid())
  ));

-- shared_expenses
DROP POLICY IF EXISTS "se_select" ON shared_expenses;
DROP POLICY IF EXISTS "se_insert" ON shared_expenses;
DROP POLICY IF EXISTS "se_delete" ON shared_expenses;

CREATE POLICY "se_select" ON shared_expenses
  FOR SELECT TO authenticated USING (is_group_member_or_owner(group_id));

CREATE POLICY "se_insert" ON shared_expenses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND is_group_member_or_owner(group_id));

CREATE POLICY "se_delete" ON shared_expenses
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND owner_id = (select auth.uid()))
  );

-- profiles
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated WITH CHECK (id = (select auth.uid()));

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated USING (id = (select auth.uid()));
