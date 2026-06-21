-- Graded slab prices (PSA/BGS/CGC/ACE/SGC/TAG), sourced from cardmarket-api-tcg
-- (RapidAPI) which returns eBay graded median prices in USD. Kept in its own
-- table (not card_prices) because it has a different refresh cadence (24h, tight
-- 100/day quota) and a different shape, and so the raw-price upsert path never
-- collides with it.
--
-- `graded` shape: { "<grader>": { "<grade>": usdPrice } }
--   e.g. { "psa": { "9": 267.06, "10": 549.16 }, "bgs": { "10": 857.59 } }
-- Keyed by card_api_id = the pokemontcg.io id (= the API's `tcgid`), so lookups
-- are exact (no fuzzy matching).

create table if not exists card_graded_prices (
    card_api_id text        primary key,
    graded      jsonb       not null,
    updated_at  timestamptz not null default now()
);

alter table card_graded_prices enable row level security;

create policy "card_graded_prices read"
    on card_graded_prices for select
    to authenticated
    using (true);
-- Writes only via the service-role (admin) client; no anon/authenticated policy.
