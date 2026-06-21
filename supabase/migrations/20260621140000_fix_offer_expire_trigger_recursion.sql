-- Fix infinite recursion in the offer auto-expire trigger.
--
-- `auto_expire_on_offer_change` fires on offers INSERT/UPDATE and itself runs an
-- UPDATE offers ... (flipping stale pending offers to 'expired'). That UPDATE
-- re-fires the same trigger, which UPDATEs again, ... until Postgres aborts with
-- "stack depth limit exceeded" — so every offer insert/update failed once the
-- 'expired' enum value existed (previously the missing enum value masked it).
--
-- The trigger's source was never committed (it was created directly on the
-- hosted DB), so this replaces it wholesale with a recursion-safe, single-
-- purpose version that does exactly what the trigger was documented to do:
-- expire pending offers older than the 7-day window (OFFER_EXPIRY_DAYS in
-- app/offers/actions.ts). The guard below is what actually breaks the loop;
-- the inner sweep runs only at the top level (pg_trigger_depth() = 1).

create or replace function vaultset_expire_stale_offers()
returns trigger
language plpgsql
as $$
begin
  -- Re-entrant call (our own UPDATE below fired the trigger again) — do nothing.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  update offers
     set status = 'expired'
   where status = 'pending'
     and created_at < now() - interval '7 days';

  return null;
end;
$$;

-- Replace the recursive trigger. Statement-level: the sweep needs to run once
-- per statement, not once per row, and the depth guard above prevents re-entry.
drop trigger if exists auto_expire_on_offer_change on offers;

create trigger auto_expire_on_offer_change
  after insert or update on offers
  for each statement
  execute function vaultset_expire_stale_offers();
