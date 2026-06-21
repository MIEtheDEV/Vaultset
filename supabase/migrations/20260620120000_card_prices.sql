-- Shared, cross-user pricing cache + free-tier request budget.
--
-- card_prices fronts every external pricing call. Reads check this table first
-- (6h freshness, enforced in app code); only stale/missing cards hit an upstream
-- API. Keyed by card_api_id (pokemontcg.io id, e.g. 'sv4-1') because that is how
-- we already identify cards — we do NOT have TCGplayer product IDs natively.
--
-- `prices` stores the per-finish price object in the SAME shape as
-- pokemontcg.io's `tcgplayer.prices` (Record<finish, { low, mid, high, market,
-- directLow }>), so PokemonTCGProvider.getMarketPrice() consumes cached and live
-- data identically with no extra mapping.
--
-- `tcgplayer_id` is the TCGplayer product ID resolved lazily from JustTCG's
-- catalog (via GET /cards) the first time a card is priced through JustTCG.
-- Once stored, future refreshes use JustTCG's efficient batch POST endpoint.

create table if not exists card_prices (
    card_api_id   text        not null,
    game          text        not null default 'pokemon',
    prices        jsonb       not null,
    tcgplayer_url text,
    tcgplayer_id  text,
    source        text        not null check (source in ('justtcg', 'tcggo', 'pokewallet', 'pokemon_tcg')),
    updated_at    timestamptz not null default now(),
    primary key (card_api_id, game)
);

create index if not exists idx_card_prices_updated_at on card_prices(updated_at);

alter table card_prices enable row level security;

-- Prices are shared and non-sensitive: any authenticated user may read.
create policy "card_prices read"
    on card_prices for select
    to authenticated
    using (true);

-- Writes happen only from the backend pricing engine via the service-role
-- (admin) client, which bypasses RLS. No anon/authenticated write policy is
-- defined, so client-side writes are rejected by default.


-- Free-tier request budget. The pricing engine increments per provider per UTC
-- day and stops calling a provider once its daily cap is reached, protecting the
-- limited free quotas (e.g. JustTCG free tier = 100 requests/day).
create table if not exists price_api_usage (
    provider      text not null,
    day           date not null default (now() at time zone 'utc')::date,
    request_count int  not null default 0,
    primary key (provider, day)
);

alter table price_api_usage enable row level security;
-- Backend-only: no read/write policies; only the service-role client touches it.
