-- ============================================================
-- Migration 030: Registered contact obligation sync
-- Run this in the Supabase SQL editor after migration 029.
-- ============================================================

-- Connected contacts create paired obligation rows: one local row per user,
-- tied by relationship_id and counterparty_obligation_id.

ALTER TABLE public.personal_obligations
  ADD COLUMN IF NOT EXISTS relationship_id uuid,
  ADD COLUMN IF NOT EXISTS counterparty_obligation_id uuid REFERENCES public.personal_obligations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.personal_obligation_settlements
  ADD COLUMN IF NOT EXISTS relationship_id uuid,
  ADD COLUMN IF NOT EXISTS counterparty_settlement_id uuid REFERENCES public.personal_obligation_settlements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS po_relationship_idx ON public.personal_obligations(relationship_id);
CREATE INDEX IF NOT EXISTS po_counterparty_idx ON public.personal_obligations(counterparty_obligation_id);
CREATE INDEX IF NOT EXISTS pos_relationship_idx ON public.personal_obligation_settlements(relationship_id);
CREATE INDEX IF NOT EXISTS pos_counterparty_idx ON public.personal_obligation_settlements(counterparty_settlement_id);

UPDATE public.personal_obligations
  SET relationship_id = COALESCE(relationship_id, gen_random_uuid()),
      created_by_user_id = COALESCE(created_by_user_id, user_id)
  WHERE relationship_id IS NULL
     OR created_by_user_id IS NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'chat_message',
    'group_invite',
    'permission_approved',
    'member_joined',
    'settlement_received',
    'settlement_confirmed',
    'settlement_rejected',
    'payment_source_pending',
    'contact_request',
    'personal_debt_created'
  ));

CREATE OR REPLACE FUNCTION public.delete_counterparty_personal_obligation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.counterparty_obligation_id IS NOT NULL THEN
    DELETE FROM personal_obligations
    WHERE id = OLD.counterparty_obligation_id
      AND counterparty_obligation_id = OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_counterparty_personal_obligation ON public.personal_obligations;
CREATE TRIGGER trg_delete_counterparty_personal_obligation
  AFTER DELETE ON public.personal_obligations
  FOR EACH ROW EXECUTE FUNCTION public.delete_counterparty_personal_obligation();

CREATE OR REPLACE FUNCTION public.create_registered_personal_obligation(
  p_direction text,
  p_contact_id uuid,
  p_amount numeric,
  p_category text,
  p_note text DEFAULT '',
  p_source_expense_id uuid DEFAULT NULL,
  p_created_at timestamptz DEFAULT now()
)
RETURNS personal_obligations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_contact contacts;
  v_target_contact contacts;
  v_creator_email text;
  v_target_email text;
  v_creator_name text;
  v_target_name text;
  v_relationship_id uuid := gen_random_uuid();
  v_creator_obligation personal_obligations;
  v_target_obligation personal_obligations;
  v_target_direction text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_direction NOT IN ('owed_to_user', 'user_owes') THEN
    RAISE EXCEPTION 'Invalid obligation direction';
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;

  SELECT * INTO v_contact
  FROM contacts
  WHERE id = p_contact_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found'; END IF;
  IF v_contact.contact_type != 'registered'
     OR v_contact.link_status != 'connected'
     OR v_contact.linked_user_id IS NULL THEN
    RAISE EXCEPTION 'Contact is not a connected Budget Journal user';
  END IF;
  IF v_contact.linked_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot create a debt with yourself';
  END IF;

  SELECT email INTO v_creator_email FROM profiles WHERE id = v_uid;
  SELECT email INTO v_target_email FROM profiles WHERE id = v_contact.linked_user_id;
  v_creator_name := COALESCE(split_part(v_creator_email, '@', 1), 'Contact');
  v_target_name := COALESCE(v_contact.name, split_part(v_target_email, '@', 1), 'Contact');
  v_target_direction := CASE WHEN p_direction = 'owed_to_user' THEN 'user_owes' ELSE 'owed_to_user' END;

  SELECT * INTO v_target_contact
  FROM contacts
  WHERE user_id = v_contact.linked_user_id
    AND linked_user_id = v_uid
    AND link_status = 'connected'
  ORDER BY created_at
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO contacts (
      user_id,
      name,
      email,
      contact_type,
      link_status,
      linked_user_id
    )
    VALUES (
      v_contact.linked_user_id,
      v_creator_name,
      v_creator_email,
      'registered',
      'connected',
      v_uid
    )
    RETURNING * INTO v_target_contact;
  END IF;

  INSERT INTO personal_obligations (
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
    relationship_id,
    created_by_user_id,
    created_at
  )
  VALUES (
    v_uid,
    p_direction,
    v_contact.id,
    v_contact.linked_user_id,
    v_target_name,
    v_contact.email,
    p_amount,
    p_amount,
    p_category,
    COALESCE(p_note, ''),
    p_source_expense_id,
    v_relationship_id,
    v_uid,
    COALESCE(p_created_at, now())
  )
  RETURNING * INTO v_creator_obligation;

  INSERT INTO personal_obligations (
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
    relationship_id,
    created_by_user_id,
    created_at
  )
  VALUES (
    v_contact.linked_user_id,
    v_target_direction,
    v_target_contact.id,
    v_uid,
    v_creator_name,
    v_creator_email,
    p_amount,
    p_amount,
    p_category,
    COALESCE(p_note, ''),
    v_relationship_id,
    v_uid,
    COALESCE(p_created_at, now())
  )
  RETURNING * INTO v_target_obligation;

  UPDATE personal_obligations
    SET counterparty_obligation_id = v_target_obligation.id
    WHERE id = v_creator_obligation.id;

  UPDATE personal_obligations
    SET counterparty_obligation_id = v_creator_obligation.id
    WHERE id = v_target_obligation.id;

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    v_contact.linked_user_id,
    'personal_debt_created',
    'Debt recorded',
    CASE
      WHEN p_direction = 'owed_to_user'
        THEN v_creator_name || ' recorded that you owe PHP ' || trim(to_char(p_amount, 'FM999G999G999G990D00')) || '.'
      ELSE v_creator_name || ' recorded that they owe you PHP ' || trim(to_char(p_amount, 'FM999G999G999G990D00')) || '.'
    END,
    v_creator_obligation.id
  );

  SELECT * INTO v_creator_obligation
  FROM personal_obligations
  WHERE id = v_creator_obligation.id;

  RETURN v_creator_obligation;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_personal_obligation_payment(
  p_obligation_id uuid,
  p_amount numeric,
  p_account_id uuid DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS personal_obligation_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_obligation personal_obligations;
  v_counterparty personal_obligations;
  v_settlement personal_obligation_settlements;
  v_counterparty_settlement personal_obligation_settlements;
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_obligation
  FROM personal_obligations
  WHERE id = p_obligation_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation not found'; END IF;
  IF v_obligation.status = 'settled' THEN RAISE EXCEPTION 'Obligation is already settled'; END IF;
  IF v_obligation.direction != 'user_owes' THEN
    RAISE EXCEPTION 'Receivable payments must be confirmed from an awaiting-confirmation settlement';
  END IF;

  v_amount := LEAST(p_amount, v_obligation.remaining_amount);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Invalid settlement amount'; END IF;

  INSERT INTO personal_obligation_settlements (
    obligation_id,
    user_id,
    amount,
    original_amount,
    payer_account_id,
    status,
    note,
    relationship_id
  )
  VALUES (
    p_obligation_id,
    v_uid,
    v_amount,
    v_amount,
    p_account_id,
    'pending_confirmation',
    COALESCE(p_note, ''),
    v_obligation.relationship_id
  )
  RETURNING * INTO v_settlement;

  IF v_obligation.counterparty_obligation_id IS NOT NULL THEN
    SELECT * INTO v_counterparty
    FROM personal_obligations
    WHERE id = v_obligation.counterparty_obligation_id
    FOR UPDATE;

    IF FOUND THEN
      INSERT INTO personal_obligation_settlements (
        obligation_id,
        user_id,
        amount,
        original_amount,
        status,
        note,
        relationship_id,
        counterparty_settlement_id
      )
      VALUES (
        v_counterparty.id,
        v_counterparty.user_id,
        v_amount,
        v_amount,
        'pending_confirmation',
        COALESCE(p_note, ''),
        v_obligation.relationship_id,
        v_settlement.id
      )
      RETURNING * INTO v_counterparty_settlement;

      UPDATE personal_obligation_settlements
        SET counterparty_settlement_id = v_counterparty_settlement.id
        WHERE id = v_settlement.id;

      INSERT INTO notifications (user_id, type, title, message, related_id)
      VALUES (
        v_counterparty.user_id,
        'settlement_received',
        'Payment awaiting confirmation',
        v_obligation.contact_name || ' marked PHP ' || trim(to_char(v_amount, 'FM999G999G999G990D00')) || ' as paid.',
        v_counterparty_settlement.id
      );
    END IF;
  END IF;

  RETURN v_settlement;
END;
$$;

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
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

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

  IF p_receiver_account_id IS NOT NULL THEN
    UPDATE financial_accounts
      SET balance = balance + v_amount
      WHERE id = p_receiver_account_id
        AND user_id = v_receiver_settlement.user_id;
  END IF;

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

CREATE OR REPLACE FUNCTION public.recall_personal_obligation_payment(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settlement personal_obligation_settlements;
  v_obligation personal_obligations;
  v_linked personal_obligation_settlements;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_settlement
  FROM personal_obligation_settlements
  WHERE id = p_settlement_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_settlement.status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'Only pending settlements can be recalled';
  END IF;

  SELECT * INTO v_obligation
  FROM personal_obligations
  WHERE id = v_settlement.obligation_id;

  IF v_settlement.counterparty_settlement_id IS NOT NULL THEN
    IF v_obligation.direction != 'user_owes' THEN
      RAISE EXCEPTION 'Only the payer can recall this settlement';
    END IF;

    SELECT * INTO v_linked
    FROM personal_obligation_settlements
    WHERE id = v_settlement.counterparty_settlement_id
    FOR UPDATE;
  END IF;

  UPDATE personal_obligation_settlements
    SET status = 'recalled',
        recalled_at = now(),
        account_movement_processed = false,
        account_movement_processed_at = NULL
    WHERE id = v_settlement.id
       OR id = v_settlement.counterparty_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_confirm_personal_obligation_payment(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settlement personal_obligation_settlements;
  v_linked personal_obligation_settlements;
  v_payer_settlement personal_obligation_settlements;
  v_receiver_settlement personal_obligation_settlements;
  v_amount numeric(12, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_settlement
  FROM personal_obligation_settlements
  WHERE id = p_settlement_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF v_settlement.status != 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed settlements can be reversed';
  END IF;
  IF v_settlement.confirmed_by_user_id != v_uid THEN
    RAISE EXCEPTION 'Only the user who confirmed this payment can undo it';
  END IF;

  v_receiver_settlement := v_settlement;
  v_payer_settlement := v_settlement;

  IF v_settlement.counterparty_settlement_id IS NOT NULL THEN
    SELECT * INTO v_linked
    FROM personal_obligation_settlements
    WHERE id = v_settlement.counterparty_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Linked settlement not found'; END IF;

    IF v_settlement.receiver_account_id IS NOT NULL THEN
      v_receiver_settlement := v_settlement;
      v_payer_settlement := v_linked;
    ELSE
      v_receiver_settlement := v_linked;
      v_payer_settlement := v_settlement;
    END IF;
  END IF;

  v_amount := COALESCE(v_receiver_settlement.confirmed_amount, v_receiver_settlement.amount);

  IF v_receiver_settlement.account_movement_processed THEN
    IF v_payer_settlement.payer_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance + v_amount
        WHERE id = v_payer_settlement.payer_account_id
          AND user_id = v_payer_settlement.user_id;
    END IF;

    IF v_receiver_settlement.receiver_account_id IS NOT NULL THEN
      UPDATE financial_accounts
        SET balance = balance - v_amount
        WHERE id = v_receiver_settlement.receiver_account_id
          AND user_id = v_receiver_settlement.user_id;
    END IF;

    UPDATE personal_obligations
      SET remaining_amount = remaining_amount + v_amount,
          status = 'open',
          settled_at = NULL
      WHERE id IN (v_receiver_settlement.obligation_id, v_payer_settlement.obligation_id);
  END IF;

  UPDATE personal_obligation_settlements
    SET amount = v_amount,
        confirmed_amount = NULL,
        status = 'pending_confirmation',
        confirmed_at = NULL,
        confirmed_by_user_id = NULL,
        account_movement_processed = false,
        account_movement_processed_at = NULL,
        confirmation_reversed_at = now()
    WHERE id IN (v_receiver_settlement.id, v_payer_settlement.id);
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
  FROM personal_obligations
  WHERE source_expense_id = NEW.id
    AND user_id = NEW.user_id
    AND direction = 'owed_to_user';

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

GRANT EXECUTE ON FUNCTION public.create_registered_personal_obligation(text, uuid, numeric, text, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_personal_obligation_payment(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_personal_obligation_payment(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recall_personal_obligation_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_confirm_personal_obligation_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
