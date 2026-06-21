-- Fix offer_status enum drift.
--
-- The app + triggers write several offer statuses that some environments'
-- offer_status enum is missing, causing inserts/updates to fail with
-- "invalid input value for enum offer_status". Most visibly, the
-- auto_expire_on_offer_change trigger fires on EVERY offers INSERT/UPDATE and
-- writes 'expired' for stale pending offers — so when 'expired' is absent, even
-- creating a brand-new offer rolls back.
--
-- Add every status the codebase uses, idempotently. ADD VALUE IF NOT EXISTS is
-- a no-op where the value already exists, so this is safe to apply anywhere.
-- (Postgres requires these to run outside an explicit transaction; the Supabase
-- migration runner executes each statement on its own, which satisfies that.)

alter type offer_status add value if not exists 'expired';
alter type offer_status add value if not exists 'countered';
alter type offer_status add value if not exists 'completed';
