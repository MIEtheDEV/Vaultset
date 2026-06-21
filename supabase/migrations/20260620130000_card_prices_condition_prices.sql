-- Add real per-condition pricing to the cache.
--
-- JustTCG returns an actual price for each raw condition (Near Mint, Lightly
-- Played, Moderately Played, Heavily Played, Damaged) per printing. Storing them
-- lets us price raw played cards from real market data instead of a flat
-- condition multiplier. Shape: { <finishKey>: { <conditionKey>: number } },
-- e.g. { "holofoil": { "near_mint": 630.39, "lightly_played": 480.00 } }.
--
-- Nullable: pokemontcg.io (bedrock) and graded cards have no per-condition data,
-- and those paths keep using the NM market × multiplier in getMarketPrice().

alter table card_prices add column if not exists condition_prices jsonb;
