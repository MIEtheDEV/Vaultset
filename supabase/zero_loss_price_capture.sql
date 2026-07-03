-- Zero-loss price capture.
-- Run once in the Supabase SQL editor, then refresh the schema snapshot
-- (`supabase db dump`). Idempotent — safe to re-run.
--
-- Rationale: every JustTCG/pokemontcg.io request returns far more than we
-- normalize (JustTCG variants carry priceHistory, priceChange7d/30d/90d,
-- avgPrice, minPrice1y/maxPrice1y, min/maxPriceAllTime, covPrice volatility,
-- trendSlope, tcgplayerSkuId; pokemontcg.io returns a full cardmarket block).
-- We now persist the COMPLETE payload so nothing a paid request fetches is lost.

-- 1. Latest full payload on the cache row (fast current read).
ALTER TABLE "public"."card_prices"
  ADD COLUMN IF NOT EXISTS "raw" "jsonb";

-- 2. Append-only archive: one row per successful fetch, never overwritten.
--    Builds a proprietary longitudinal price dataset beyond JustTCG's own windows.
CREATE TABLE IF NOT EXISTS "public"."card_price_snapshots" (
  "id"          "uuid"      DEFAULT "gen_random_uuid"() NOT NULL,
  "card_api_id" "text"      NOT NULL,
  "game"        "text"      DEFAULT 'pokemon'::"text"   NOT NULL,
  "source"      "text"      NOT NULL,
  "raw"         "jsonb"     NOT NULL,
  "fetched_at"  timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "card_price_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "card_price_snapshots_source_check"
    CHECK (("source" = ANY (ARRAY['justtcg'::"text", 'tcggo'::"text", 'pokewallet'::"text", 'pokemon_tcg'::"text"])))
);

ALTER TABLE "public"."card_price_snapshots" OWNER TO "postgres";

-- Fast "history for this card, newest first" lookups.
CREATE INDEX IF NOT EXISTS "card_price_snapshots_card_idx"
  ON "public"."card_price_snapshots" ("card_api_id", "game", "fetched_at" DESC);

-- Internal archive: written by the service-role backend only, never read by
-- clients. Enable RLS with no policies so anon/authenticated cannot read it;
-- the service role bypasses RLS.
ALTER TABLE "public"."card_price_snapshots" ENABLE ROW LEVEL SECURITY;
