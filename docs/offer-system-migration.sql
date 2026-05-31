-- Offer System Enhancements Migration
-- Run in Supabase SQL Editor before deploying

-- 1. Counter-offer linkage (required for /counter-offer feature)
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS parent_offer_id uuid REFERENCES offers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS offers_parent_offer_id_idx
  ON offers(parent_offer_id)
  WHERE parent_offer_id IS NOT NULL;

-- 2. Preserve original for_sale / for_trade on offer_items so they can be
--    restored when a cancellation releases held cards.
ALTER TABLE offer_items
  ADD COLUMN IF NOT EXISTS original_for_sale  boolean,
  ADD COLUMN IF NOT EXISTS original_for_trade boolean;

-- 3. Remove the dead trade_description field (never written or displayed)
ALTER TABLE offers DROP COLUMN IF EXISTS trade_description;

-- 3. Optional: backfill expires_at if you want DB-level expiry tracking.
--    The app computes expiry from created_at + 7 days; this column is informational only.
-- ALTER TABLE offers ADD COLUMN IF NOT EXISTS expires_at timestamptz;
-- UPDATE offers SET expires_at = created_at + INTERVAL '7 days' WHERE status = 'pending';
