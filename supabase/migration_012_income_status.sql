-- Add status column to income_entries
ALTER TABLE income_entries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('expected', 'received'));

-- Drop existing trigger and function, then recreate with status-aware logic
DROP TRIGGER IF EXISTS income_account_balance_trigger ON income_entries;
DROP TRIGGER IF EXISTS on_income_entry_change ON income_entries;
DROP FUNCTION IF EXISTS handle_income_account_balance() CASCADE;

CREATE OR REPLACE FUNCTION handle_income_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_id IS NOT NULL AND NEW.status = 'received' THEN
      UPDATE financial_accounts
        SET balance = balance + NEW.amount
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.account_id IS NOT NULL AND OLD.status = 'received' THEN
      UPDATE financial_accounts
        SET balance = balance - OLD.amount
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Reverse old contribution (only if old was received and had account)
    IF OLD.account_id IS NOT NULL AND OLD.status = 'received' THEN
      UPDATE financial_accounts
        SET balance = balance - OLD.amount
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
    END IF;
    -- Apply new contribution (only if new is received and has account)
    IF NEW.account_id IS NOT NULL AND NEW.status = 'received' THEN
      UPDATE financial_accounts
        SET balance = balance + NEW.amount
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER on_income_entry_change
  AFTER INSERT OR UPDATE OR DELETE ON income_entries
  FOR EACH ROW EXECUTE FUNCTION handle_income_account_balance();
