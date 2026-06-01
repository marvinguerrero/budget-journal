-- ============================================================
-- Migration 056: Optional personal expense participants
-- Run this in the Supabase SQL editor after migration 055.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expense_participants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id         uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_kind   text NOT NULL DEFAULT 'contact'
    CHECK (participant_kind IN ('self', 'contact', 'external')),
  contact_id         uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  participant_name   text NOT NULL,
  participant_email  text,
  participant_phone  text,
  share_amount       numeric(12, 2) NOT NULL CHECK (share_amount >= 0),
  is_payer           boolean NOT NULL DEFAULT false,
  obligation_id      uuid REFERENCES public.personal_obligations(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_participants
  ADD COLUMN IF NOT EXISTS participant_phone text;

CREATE INDEX IF NOT EXISTS ep_expense_idx ON public.expense_participants(expense_id);
CREATE INDEX IF NOT EXISTS ep_user_idx ON public.expense_participants(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ep_obligation_idx ON public.expense_participants(obligation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_participants TO authenticated;

ALTER TABLE public.expense_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ep_select" ON public.expense_participants;
DROP POLICY IF EXISTS "ep_insert" ON public.expense_participants;
DROP POLICY IF EXISTS "ep_update" ON public.expense_participants;
DROP POLICY IF EXISTS "ep_delete" ON public.expense_participants;

CREATE POLICY "ep_select" ON public.expense_participants
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "ep_insert" ON public.expense_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_id
        AND e.user_id = (select auth.uid())
    )
  );

CREATE POLICY "ep_update" ON public.expense_participants
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "ep_delete" ON public.expense_participants
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.create_missing_expense_participant_obligations(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant record;
  v_payer record;
  v_obligation_id uuid;
  v_direction text;
  v_contact_id uuid;
  v_contact_user_id uuid;
  v_contact_name text;
  v_contact_email text;
BEGIN
  SELECT *
  INTO v_payer
  FROM public.expense_participants
  WHERE expense_id = p_expense_id
    AND is_payer = true
  ORDER BY created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_participant IN
    SELECT
      ep.*,
      e.category AS expense_category,
      e.note AS expense_note,
      e.created_at AS expense_created_at
    FROM public.expense_participants ep
    JOIN public.expenses e ON e.id = ep.expense_id
    WHERE ep.expense_id = p_expense_id
      AND ep.obligation_id IS NULL
      AND ep.share_amount > 0
      AND ep.user_id = e.user_id
  LOOP
    v_direction := NULL;
    v_contact_id := NULL;
    v_contact_user_id := NULL;
    v_contact_name := NULL;
    v_contact_email := NULL;

    IF v_payer.participant_kind = 'self'
       AND v_participant.is_payer = false
       AND v_participant.participant_kind <> 'self' THEN
      v_direction := 'owed_to_user';
      v_contact_id := v_participant.contact_id;
      v_contact_user_id := v_participant.contact_user_id;
      v_contact_name := v_participant.participant_name;
      v_contact_email := v_participant.participant_email;
    ELSIF v_payer.participant_kind <> 'self'
       AND v_participant.is_payer = false
       AND v_participant.participant_kind = 'self' THEN
      v_direction := 'user_owes';
      v_contact_id := v_payer.contact_id;
      v_contact_user_id := v_payer.contact_user_id;
      v_contact_name := v_payer.participant_name;
      v_contact_email := v_payer.participant_email;
    END IF;

    IF v_direction IS NULL THEN
      CONTINUE;
    END IF;

    SELECT po.id INTO v_obligation_id
    FROM public.personal_obligations po
    WHERE po.user_id = v_participant.user_id
      AND po.source_expense_id = v_participant.expense_id
      AND po.direction = v_direction
      AND po.contact_name = v_contact_name
      AND po.amount = v_participant.share_amount
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_participants linked
        WHERE linked.obligation_id = po.id
      )
    ORDER BY po.created_at
    LIMIT 1;

    IF v_obligation_id IS NULL THEN
      INSERT INTO public.personal_obligations (
        user_id,
        direction,
        contact_id,
        contact_user_id,
        contact_name,
        contact_email,
        amount,
        remaining_amount,
        category,
        note,
        source_expense_id,
        created_at
      )
      VALUES (
        v_participant.user_id,
        v_direction,
        v_contact_id,
        v_contact_user_id,
        v_contact_name,
        v_contact_email,
        v_participant.share_amount,
        v_participant.share_amount,
        v_participant.expense_category,
        COALESCE(v_participant.expense_note, ''),
        v_participant.expense_id,
        COALESCE(v_participant.expense_created_at, now())
      )
      RETURNING id INTO v_obligation_id;
    END IF;

    UPDATE public.expense_participants
    SET obligation_id = v_obligation_id
    WHERE id = v_participant.id
      AND obligation_id IS NULL;

    v_obligation_id := NULL;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_expense_participant_obligations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_missing_expense_participant_obligations(NEW.expense_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_expense_participant_obligations ON public.expense_participants;
CREATE TRIGGER trg_sync_expense_participant_obligations
  AFTER INSERT OR UPDATE OF
    is_payer,
    participant_kind,
    contact_id,
    contact_user_id,
    participant_name,
    participant_email,
    share_amount
  ON public.expense_participants
  FOR EACH ROW EXECUTE FUNCTION public.sync_expense_participant_obligations();

DO $$
DECLARE
  v_expense_id uuid;
BEGIN
  FOR v_expense_id IN
    SELECT DISTINCT expense_id
    FROM public.expense_participants
  LOOP
    PERFORM public.create_missing_expense_participant_obligations(v_expense_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_personal_obligation_from_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obligation personal_obligations;
  v_delta numeric(12, 2);
  v_remaining numeric(12, 2);
BEGIN
  SELECT * INTO v_obligation
  FROM personal_obligations po
  WHERE po.source_expense_id = NEW.id
    AND po.user_id = NEW.user_id
    AND po.direction = 'owed_to_user'
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_participants ep
      WHERE ep.obligation_id = po.id
    );

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_delta := NEW.amount - OLD.amount;
  v_remaining := GREATEST(0, v_obligation.remaining_amount + v_delta);

  UPDATE personal_obligations
    SET amount = NEW.amount,
        remaining_amount = v_remaining,
        category = NEW.category,
        note = NEW.note,
        status = CASE WHEN v_remaining <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN v_remaining <= 0.005 THEN COALESCE(settled_at, now()) ELSE NULL END
    WHERE id = v_obligation.id;

  IF v_obligation.counterparty_obligation_id IS NOT NULL THEN
    UPDATE personal_obligations
      SET amount = NEW.amount,
          remaining_amount = GREATEST(0, remaining_amount + v_delta),
          category = NEW.category,
          note = NEW.note,
          status = CASE WHEN GREATEST(0, remaining_amount + v_delta) <= 0.005 THEN 'settled' ELSE 'open' END,
          settled_at = CASE WHEN GREATEST(0, remaining_amount + v_delta) <= 0.005 THEN COALESCE(settled_at, now()) ELSE NULL END
      WHERE id = v_obligation.counterparty_obligation_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_personal_settlement_source_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obligation personal_obligations;
  v_linked personal_obligation_settlements;
  v_linked_obligation personal_obligations;
  v_contact contacts;
  v_is_external boolean := false;
  v_obligation_found boolean := false;
  v_linked_found boolean := false;
  v_linked_obligation_found boolean := false;
BEGIN
  IF NEW.status IN ('pending_confirmation', 'confirmed') THEN
    SELECT * INTO v_obligation
    FROM personal_obligations
    WHERE id = NEW.obligation_id;
    v_obligation_found := FOUND;

    IF v_obligation_found THEN
      IF v_obligation.contact_id IS NOT NULL THEN
        SELECT * INTO v_contact
        FROM contacts
        WHERE id = v_obligation.contact_id;
      END IF;

      v_is_external :=
        v_obligation.contact_user_id IS NULL
        AND (
          v_obligation.contact_id IS NULL
          OR COALESCE(v_contact.contact_type, 'external') = 'external'
        );
    END IF;

    IF v_obligation_found
       AND v_obligation.direction = 'user_owes'
       AND NEW.payer_account_id IS NULL
       AND NOT v_is_external THEN
      RAISE EXCEPTION 'Please select a source account.';
    END IF;

    IF v_obligation_found
       AND v_obligation.direction = 'owed_to_user'
       AND NEW.counterparty_settlement_id IS NOT NULL THEN
      SELECT * INTO v_linked
      FROM personal_obligation_settlements
      WHERE id = NEW.counterparty_settlement_id;
      v_linked_found := FOUND;

      IF v_linked_found THEN
        SELECT * INTO v_linked_obligation
        FROM personal_obligations
        WHERE id = v_linked.obligation_id;
        v_linked_obligation_found := FOUND;

        v_is_external := false;
        v_contact := NULL;

        IF v_linked_obligation_found THEN
          IF v_linked_obligation.contact_id IS NOT NULL THEN
            SELECT * INTO v_contact
            FROM contacts
            WHERE id = v_linked_obligation.contact_id;
          END IF;

          v_is_external :=
            v_linked_obligation.contact_user_id IS NULL
            AND (
              v_linked_obligation.contact_id IS NULL
              OR COALESCE(v_contact.contact_type, 'external') = 'external'
            );
        END IF;
      END IF;

      IF v_linked_found AND v_linked.payer_account_id IS NULL AND NOT v_is_external THEN
        RAISE EXCEPTION 'Please select a source account.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_personal_settlement_source_account ON public.personal_obligation_settlements;
CREATE TRIGGER trg_require_personal_settlement_source_account
  BEFORE INSERT OR UPDATE ON public.personal_obligation_settlements
  FOR EACH ROW EXECUTE FUNCTION public.require_personal_settlement_source_account();

DROP FUNCTION IF EXISTS public.confirm_personal_obligation_payment(uuid);
DROP FUNCTION IF EXISTS public.confirm_personal_obligation_payment(uuid, numeric, uuid);
CREATE OR REPLACE FUNCTION public.confirm_personal_obligation_payment(
  p_settlement_id uuid,
  p_amount numeric DEFAULT NULL,
  p_receiver_account_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settlement personal_obligation_settlements;
  v_payer_settlement personal_obligation_settlements;
  v_receiver_settlement personal_obligation_settlements;
  v_obligation personal_obligations;
  v_counterparty personal_obligations;
  v_payer_obligation personal_obligations;
  v_payer_contact contacts;
  v_amount numeric(12, 2);
  v_external_payer boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_receiver_account_id IS NULL THEN RAISE EXCEPTION 'Please select a destination account.'; END IF;

  SELECT * INTO v_settlement
  FROM personal_obligation_settlements
  WHERE id = p_settlement_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_settlement.account_movement_processed THEN
    RETURN;
  END IF;
  IF v_settlement.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Only pending settlements can be confirmed';
  END IF;

  SELECT * INTO v_obligation
  FROM personal_obligations
  WHERE id = v_settlement.obligation_id
  FOR UPDATE;

  IF v_obligation.counterparty_obligation_id IS NOT NULL
     AND v_obligation.direction = 'user_owes' THEN
    RAISE EXCEPTION 'Only the receiver can confirm this settlement';
  END IF;

  v_receiver_settlement := v_settlement;
  v_payer_settlement := v_settlement;

  IF v_settlement.counterparty_settlement_id IS NOT NULL THEN
    SELECT * INTO v_payer_settlement
    FROM personal_obligation_settlements
    WHERE id = v_settlement.counterparty_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Linked settlement not found'; END IF;

    IF v_obligation.direction = 'user_owes' THEN
      v_receiver_settlement := v_payer_settlement;
      v_payer_settlement := v_settlement;
    END IF;
  END IF;

  SELECT * INTO v_payer_obligation
  FROM personal_obligations
  WHERE id = v_payer_settlement.obligation_id;

  IF FOUND THEN
    IF v_payer_obligation.contact_id IS NOT NULL THEN
      SELECT * INTO v_payer_contact
      FROM contacts
      WHERE id = v_payer_obligation.contact_id;
    END IF;

    v_external_payer :=
      v_payer_obligation.contact_user_id IS NULL
      AND (
        v_payer_obligation.contact_id IS NULL
        OR COALESCE(v_payer_contact.contact_type, 'external') = 'external'
      );
  END IF;

  IF v_payer_settlement.payer_account_id IS NULL AND NOT v_external_payer THEN
    RAISE EXCEPTION 'Please select a source account.';
  END IF;

  v_amount := COALESCE(p_amount, v_receiver_settlement.amount);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;
  IF v_amount > v_receiver_settlement.amount + 0.005 THEN
    RAISE EXCEPTION 'Settlement amount cannot exceed the remaining balance';
  END IF;

  IF v_payer_settlement.payer_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance - v_amount
      WHERE id = v_payer_settlement.payer_account_id
        AND user_id = v_payer_settlement.user_id;
  END IF;

  UPDATE financial_accounts
    SET balance = balance + v_amount
    WHERE id = p_receiver_account_id
      AND user_id = v_receiver_settlement.user_id;

  UPDATE personal_obligation_settlements
    SET amount = v_amount,
        confirmed_amount = v_amount,
        receiver_account_id = CASE WHEN id = v_receiver_settlement.id THEN p_receiver_account_id ELSE receiver_account_id END,
        status = 'confirmed',
        confirmed_at = now(),
        confirmed_by_user_id = v_uid,
        confirmation_reversed_at = NULL,
        account_movement_processed = true,
        account_movement_processed_at = now()
    WHERE id IN (v_receiver_settlement.id, v_payer_settlement.id);

  UPDATE personal_obligations
    SET remaining_amount = GREATEST(0, remaining_amount - v_amount),
        status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
        settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE NULL END
    WHERE id = v_receiver_settlement.obligation_id;

  SELECT * INTO v_counterparty
  FROM personal_obligations
  WHERE id = v_payer_settlement.obligation_id
  FOR UPDATE;

  IF FOUND AND v_counterparty.id != v_receiver_settlement.obligation_id THEN
    UPDATE personal_obligations
      SET remaining_amount = GREATEST(0, remaining_amount - v_amount),
          status = CASE WHEN remaining_amount - v_amount <= 0.005 THEN 'settled' ELSE 'open' END,
          settled_at = CASE WHEN remaining_amount - v_amount <= 0.005 THEN now() ELSE NULL END
      WHERE id = v_counterparty.id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_personal_obligation_payment(uuid, numeric, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
