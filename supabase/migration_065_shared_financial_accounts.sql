-- ============================================================
-- Migration 065: Shared financial accounts
-- Run this after migration_064.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shared_financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  permission_level text NOT NULL DEFAULT 'viewer'
    CHECK (permission_level IN ('viewer', 'contributor', 'manager')),
  can_view_balance boolean NOT NULL DEFAULT true,
  can_view_expenses boolean NOT NULL DEFAULT true,
  can_view_receipts boolean NOT NULL DEFAULT false,
  can_view_itemization boolean NOT NULL DEFAULT false,
  can_add_expense boolean NOT NULL DEFAULT false,
  can_edit_own_expense boolean NOT NULL DEFAULT false,
  can_manage_sharing boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sfa_not_owner CHECK (owner_user_id <> shared_with_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_financial_accounts_active_unique
  ON public.shared_financial_accounts(account_id, shared_with_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_shared_financial_accounts_owner
  ON public.shared_financial_accounts(owner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_financial_accounts_recipient
  ON public.shared_financial_accounts(shared_with_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_financial_accounts_account
  ON public.shared_financial_accounts(account_id, status);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_account_id uuid REFERENCES public.shared_financial_accounts(id) ON DELETE SET NULL;

UPDATE public.expenses
  SET owner_user_id = COALESCE(owner_user_id, user_id),
      created_by_user_id = COALESCE(created_by_user_id, user_id)
  WHERE owner_user_id IS NULL OR created_by_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_owner_created
  ON public.expenses(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_created_by_created
  ON public.expenses(created_by_user_id, created_at DESC)
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_shared_account_created
  ON public.expenses(shared_account_id, created_at DESC)
  WHERE shared_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_shared_financial_accounts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shared_financial_accounts_updated_at ON public.shared_financial_accounts;
CREATE TRIGGER trg_shared_financial_accounts_updated_at
  BEFORE UPDATE ON public.shared_financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_shared_financial_accounts_updated_at();

CREATE OR REPLACE FUNCTION public.set_expense_audit_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.owner_user_id = COALESCE(NEW.owner_user_id, NEW.user_id);
  NEW.created_by_user_id = COALESCE(NEW.created_by_user_id, auth.uid(), NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_audit_defaults ON public.expenses;
CREATE TRIGGER trg_expense_audit_defaults
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_expense_audit_defaults();

CREATE OR REPLACE FUNCTION public.can_manage_shared_financial_account(
  p_account_id uuid,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.financial_accounts fa
    WHERE fa.id = p_account_id
      AND fa.user_id = p_actor_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.shared_financial_accounts sfa
    WHERE sfa.account_id = p_account_id
      AND sfa.shared_with_user_id = p_actor_user_id
      AND sfa.status = 'active'
      AND sfa.can_manage_sharing = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_shared_account_expenses(
  p_account_id uuid,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shared_financial_accounts sfa
    WHERE sfa.account_id = p_account_id
      AND sfa.shared_with_user_id = p_actor_user_id
      AND sfa.status = 'active'
      AND sfa.can_view_expenses = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_shared_account_expense(
  p_expense_id uuid,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses e
    JOIN public.shared_financial_accounts sfa
      ON sfa.id = e.shared_account_id
    WHERE e.id = p_expense_id
      AND sfa.status = 'active'
      AND sfa.shared_with_user_id = p_actor_user_id
      AND (
        sfa.permission_level = 'manager'
        OR (
          sfa.can_edit_own_expense = true
          AND e.created_by_user_id = p_actor_user_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_expense_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_owner uuid;
  v_new_owner uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_id IS NOT NULL THEN
      v_new_owner := COALESCE(NEW.owner_user_id, NEW.user_id);
      UPDATE financial_accounts
        SET balance = balance - NEW.amount
        WHERE id = NEW.account_id AND user_id = v_new_owner;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.account_id IS NOT NULL THEN
      v_old_owner := COALESCE(OLD.owner_user_id, OLD.user_id);
      UPDATE financial_accounts
        SET balance = balance + OLD.amount
        WHERE id = OLD.account_id AND user_id = v_old_owner;
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.account_id IS NOT NULL THEN
      v_old_owner := COALESCE(OLD.owner_user_id, OLD.user_id);
      UPDATE financial_accounts
        SET balance = balance + OLD.amount
        WHERE id = OLD.account_id AND user_id = v_old_owner;
    END IF;
    IF NEW.account_id IS NOT NULL THEN
      v_new_owner := COALESCE(NEW.owner_user_id, NEW.user_id);
      UPDATE financial_accounts
        SET balance = balance - NEW.amount
        WHERE id = NEW.account_id AND user_id = v_new_owner;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_financial_accounts TO authenticated;
ALTER TABLE public.shared_financial_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sfa_select_participants" ON public.shared_financial_accounts;
DROP POLICY IF EXISTS "sfa_insert_manager" ON public.shared_financial_accounts;
DROP POLICY IF EXISTS "sfa_update_manager" ON public.shared_financial_accounts;
DROP POLICY IF EXISTS "sfa_delete_manager" ON public.shared_financial_accounts;

CREATE POLICY "sfa_select_participants" ON public.shared_financial_accounts
  FOR SELECT TO authenticated
  USING (
    owner_user_id = (select auth.uid())
    OR shared_with_user_id = (select auth.uid())
  );

CREATE POLICY "sfa_insert_manager" ON public.shared_financial_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_shared_financial_account(account_id, (select auth.uid())));

CREATE POLICY "sfa_update_manager" ON public.shared_financial_accounts
  FOR UPDATE TO authenticated
  USING (public.can_manage_shared_financial_account(account_id, (select auth.uid())))
  WITH CHECK (public.can_manage_shared_financial_account(account_id, (select auth.uid())));

CREATE POLICY "sfa_delete_manager" ON public.shared_financial_accounts
  FOR DELETE TO authenticated
  USING (public.can_manage_shared_financial_account(account_id, (select auth.uid())));

DROP POLICY IF EXISTS "fa_select_shared_balance" ON public.financial_accounts;
CREATE POLICY "fa_select_shared_balance" ON public.financial_accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shared_financial_accounts sfa
      WHERE sfa.account_id = financial_accounts.id
        AND sfa.shared_with_user_id = (select auth.uid())
        AND sfa.status = 'active'
        AND sfa.can_view_balance = true
    )
  );

DROP POLICY IF EXISTS "expenses_select_shared_account" ON public.expenses;
CREATE POLICY "expenses_select_shared_account" ON public.expenses
  FOR SELECT TO authenticated
  USING (public.can_view_shared_account_expenses(account_id, (select auth.uid())));

DROP POLICY IF EXISTS "expenses_update_shared_account" ON public.expenses;
CREATE POLICY "expenses_update_shared_account" ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.can_edit_shared_account_expense(id, (select auth.uid())))
  WITH CHECK (
    owner_user_id = user_id
    AND public.can_edit_shared_account_expense(id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "at_select_shared_account" ON public.account_transfers;
CREATE POLICY "at_select_shared_account" ON public.account_transfers
  FOR SELECT TO authenticated
  USING (
    public.can_view_shared_account_expenses(from_account_id, (select auth.uid()))
    OR public.can_view_shared_account_expenses(to_account_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "eli_select_shared_account_itemization" ON public.expense_line_items;
CREATE POLICY "eli_select_shared_account_itemization" ON public.expense_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      JOIN public.shared_financial_accounts sfa
        ON sfa.account_id = e.account_id
      WHERE e.id = expense_line_items.expense_id
        AND sfa.shared_with_user_id = (select auth.uid())
        AND sfa.status = 'active'
        AND sfa.can_view_itemization = true
    )
  );

DROP POLICY IF EXISTS "ep_select_shared_account_itemization" ON public.expense_participants;
CREATE POLICY "ep_select_shared_account_itemization" ON public.expense_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      JOIN public.shared_financial_accounts sfa
        ON sfa.account_id = e.account_id
      WHERE e.id = expense_participants.expense_id
        AND sfa.shared_with_user_id = (select auth.uid())
        AND sfa.status = 'active'
        AND sfa.can_view_itemization = true
    )
  );

DROP POLICY IF EXISTS "Users can view shared account receipts" ON storage.objects;
CREATE POLICY "Users can view shared account receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1
    FROM public.expenses e
    JOIN public.shared_financial_accounts sfa
      ON sfa.account_id = e.account_id
    WHERE e.receipt_path = storage.objects.name
      AND sfa.shared_with_user_id = (select auth.uid())
      AND sfa.status = 'active'
      AND sfa.can_view_receipts = true
  )
);

CREATE OR REPLACE FUNCTION public.share_financial_account(
  p_account_id uuid,
  p_contact_id uuid,
  p_permission_level text DEFAULT 'viewer',
  p_can_view_balance boolean DEFAULT true,
  p_can_view_expenses boolean DEFAULT true,
  p_can_view_receipts boolean DEFAULT false,
  p_can_view_itemization boolean DEFAULT false,
  p_can_add_expense boolean DEFAULT false,
  p_can_edit_own_expense boolean DEFAULT false,
  p_can_manage_sharing boolean DEFAULT false
)
RETURNS public.shared_financial_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_account public.financial_accounts;
  v_contact public.contacts;
  v_row public.shared_financial_accounts;
  v_can_add boolean;
  v_can_edit_own boolean;
  v_can_manage boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_permission_level NOT IN ('viewer', 'contributor', 'manager') THEN
    RAISE EXCEPTION 'Invalid permission level.';
  END IF;

  SELECT * INTO v_account
  FROM public.financial_accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found.';
  END IF;

  IF NOT public.can_manage_shared_financial_account(p_account_id, v_actor) THEN
    RAISE EXCEPTION 'You cannot manage sharing for this account.';
  END IF;

  SELECT * INTO v_contact
  FROM public.contacts
  WHERE id = p_contact_id
    AND user_id = v_actor
    AND contact_type = 'registered'
    AND link_status = 'connected'
    AND linked_user_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only connected registered contacts can receive account access.';
  END IF;

  IF v_contact.linked_user_id = v_account.user_id THEN
    RAISE EXCEPTION 'The account owner already has access.';
  END IF;

  v_can_add := p_can_add_expense OR p_permission_level IN ('contributor', 'manager');
  v_can_edit_own := p_can_edit_own_expense OR p_permission_level IN ('contributor', 'manager');
  v_can_manage := p_can_manage_sharing OR p_permission_level = 'manager';

  INSERT INTO public.shared_financial_accounts (
    account_id,
    owner_user_id,
    shared_with_user_id,
    contact_id,
    permission_level,
    can_view_balance,
    can_view_expenses,
    can_view_receipts,
    can_view_itemization,
    can_add_expense,
    can_edit_own_expense,
    can_manage_sharing,
    status
  )
  VALUES (
    p_account_id,
    v_account.user_id,
    v_contact.linked_user_id,
    p_contact_id,
    p_permission_level,
    p_can_view_balance,
    p_can_view_expenses,
    p_can_view_receipts,
    p_can_view_itemization,
    v_can_add,
    v_can_edit_own,
    v_can_manage,
    'active'
  )
  ON CONFLICT (account_id, shared_with_user_id) WHERE status = 'active'
  DO UPDATE SET
    contact_id = EXCLUDED.contact_id,
    permission_level = EXCLUDED.permission_level,
    can_view_balance = EXCLUDED.can_view_balance,
    can_view_expenses = EXCLUDED.can_view_expenses,
    can_view_receipts = EXCLUDED.can_view_receipts,
    can_view_itemization = EXCLUDED.can_view_itemization,
    can_add_expense = EXCLUDED.can_add_expense,
    can_edit_own_expense = EXCLUDED.can_edit_own_expense,
    can_manage_sharing = EXCLUDED.can_manage_sharing,
    status = 'active',
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_shared_financial_account_access(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_share public.shared_financial_accounts;
BEGIN
  SELECT * INTO v_share
  FROM public.shared_financial_accounts
  WHERE id = p_share_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared access not found.';
  END IF;

  IF NOT public.can_manage_shared_financial_account(v_share.account_id, v_actor) THEN
    RAISE EXCEPTION 'You cannot manage sharing for this account.';
  END IF;

  UPDATE public.shared_financial_accounts
    SET status = 'removed',
        updated_at = now()
    WHERE id = p_share_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_financial_accounts_with_me()
RETURNS TABLE (
  share_id uuid,
  account_id uuid,
  owner_user_id uuid,
  owner_email text,
  account_name text,
  account_emoji text,
  account_color text,
  account_type text,
  account_category text,
  balance numeric,
  currency_code text,
  base_currency_code text,
  permission_level text,
  can_view_balance boolean,
  can_view_expenses boolean,
  can_view_receipts boolean,
  can_view_itemization boolean,
  can_add_expense boolean,
  can_edit_own_expense boolean,
  can_manage_sharing boolean,
  status text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    sfa.id,
    fa.id,
    sfa.owner_user_id,
    p.email,
    fa.name,
    fa.emoji,
    fa.color,
    fa.type,
    fa.category,
    CASE WHEN sfa.can_view_balance THEN fa.balance ELSE NULL END,
    fa.currency_code,
    fa.base_currency_code,
    sfa.permission_level,
    sfa.can_view_balance,
    sfa.can_view_expenses,
    sfa.can_view_receipts,
    sfa.can_view_itemization,
    sfa.can_add_expense,
    sfa.can_edit_own_expense,
    sfa.can_manage_sharing,
    sfa.status
  FROM public.shared_financial_accounts sfa
  JOIN public.financial_accounts fa ON fa.id = sfa.account_id
  LEFT JOIN public.profiles p ON p.id = sfa.owner_user_id
  WHERE sfa.shared_with_user_id = auth.uid()
    AND sfa.status = 'active'
  ORDER BY sfa.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_financial_account_summary(p_account_id uuid)
RETURNS TABLE (
  share_id uuid,
  account_id uuid,
  owner_user_id uuid,
  owner_email text,
  account_name text,
  account_emoji text,
  account_color text,
  account_type text,
  account_category text,
  balance numeric,
  currency_code text,
  base_currency_code text,
  permission_level text,
  can_view_balance boolean,
  can_view_expenses boolean,
  can_view_receipts boolean,
  can_view_itemization boolean,
  can_add_expense boolean,
  can_edit_own_expense boolean,
  can_manage_sharing boolean,
  status text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    sfa.id,
    fa.id,
    sfa.owner_user_id,
    p.email,
    fa.name,
    fa.emoji,
    fa.color,
    fa.type,
    fa.category,
    CASE WHEN sfa.can_view_balance THEN fa.balance ELSE NULL END,
    fa.currency_code,
    fa.base_currency_code,
    sfa.permission_level,
    sfa.can_view_balance,
    sfa.can_view_expenses,
    sfa.can_view_receipts,
    sfa.can_view_itemization,
    sfa.can_add_expense,
    sfa.can_edit_own_expense,
    sfa.can_manage_sharing,
    sfa.status
  FROM public.shared_financial_accounts sfa
  JOIN public.financial_accounts fa ON fa.id = sfa.account_id
  LEFT JOIN public.profiles p ON p.id = sfa.owner_user_id
  WHERE sfa.account_id = p_account_id
    AND sfa.shared_with_user_id = auth.uid()
    AND sfa.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.create_shared_account_expense(
  p_shared_account_id uuid,
  p_amount numeric,
  p_category text,
  p_note text DEFAULT '',
  p_created_at timestamptz DEFAULT now()
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_share public.shared_financial_accounts;
  v_expense public.expenses;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_share
  FROM public.shared_financial_accounts
  WHERE id = p_shared_account_id
    AND shared_with_user_id = v_actor
    AND status = 'active'
    AND can_add_expense = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You cannot add expenses to this shared account.';
  END IF;

  INSERT INTO public.expenses (
    user_id,
    owner_user_id,
    created_by_user_id,
    shared_account_id,
    account_id,
    amount,
    original_amount,
    category,
    note,
    created_at
  )
  VALUES (
    v_share.owner_user_id,
    v_share.owner_user_id,
    v_actor,
    v_share.id,
    v_share.account_id,
    p_amount,
    p_amount,
    COALESCE(NULLIF(trim(p_category), ''), 'Others'),
    COALESCE(p_note, ''),
    COALESCE(p_created_at, now())
  )
  RETURNING * INTO v_expense;

  RETURN v_expense;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_shared_financial_account(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_shared_account_expenses(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_shared_account_expense(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.share_financial_account(uuid, uuid, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_shared_financial_account_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_financial_accounts_with_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_financial_account_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_shared_account_expense(uuid, numeric, text, text, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
