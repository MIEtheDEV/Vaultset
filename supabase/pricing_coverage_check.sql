-- Pricing coverage check (marketing-strategy §8 #4)
-- ---------------------------------------------------------------------------
-- Question this answers: before we headline "the most accurate, net-of-fees
-- pricing in TCG", what share of a *real* collection actually resolves to
-- real-time / graded prices vs. ~24h-stale pokemontcg.io bedrock (or no price
-- at all)? Run in the Supabase SQL editor.
--
-- How it maps to code:
--   * price cache key = priceApiId() in lib/pricing/cardIdentity.ts:
--       game_data->>'pokemon_api_id'  -> else 'tcg:'||game_data->>'tcgplayer_id'
--       -> else 'manual:'||cards.id
--   * card_prices.source: 'justtcg' = real-time; 'pokemon_tcg' = bedrock (stale).
--   * card_prices.condition_prices not null = real per-condition raw pricing.
--   * card_graded_prices = real eBay slab medians (further filtered in code by
--     grader/grade/sample>=2 — this query measures row presence, an upper bound).
--   * "fresh" mirrors the 6h serve window the engine uses before re-fetching.
--
-- Weighting: one row per collection_items entry (what a user sees per card).
-- To scope to one collection, uncomment the WHERE in `items`.
-- ---------------------------------------------------------------------------

with items as (
  select
    ci.id,
    ci.grader,
    ci.grade,
    case
      when c.game_data->>'pokemon_api_id' is not null then c.game_data->>'pokemon_api_id'
      when c.game_data->>'tcgplayer_id'   is not null then 'tcg:' || (c.game_data->>'tcgplayer_id')
      else 'manual:' || c.id
    end as price_key
  from collection_items ci
  join cards c on c.id = ci.card_id
  -- where ci.user_id = '<USER_UUID>'   -- optional: a single collection
),
joined as (
  select
    i.*,
    cp.source,
    cp.updated_at,
    cp.condition_prices is not null as has_condition,
    (i.grader is not null and i.grade is not null) as is_graded,
    gp.card_api_id is not null as has_graded_median
  from items i
  left join card_prices cp on cp.card_api_id = i.price_key
  left join card_graded_prices gp on gp.card_api_id = i.price_key
)
select metric, value, pct_of_total from (
  select 1 ord, 'total items'                      as metric, count(*)::text as value, '100%' as pct_of_total from joined
  union all select 2, 'priced (any source)',  count(*) filter (where source is not null)::text,
    round(100.0*count(*) filter (where source is not null)/nullif(count(*),0),1)||'%' from joined
  union all select 3, '  real-time (justtcg)',    count(*) filter (where source='justtcg')::text,
    round(100.0*count(*) filter (where source='justtcg')/nullif(count(*),0),1)||'%' from joined
  union all select 4, '  bedrock (pokemon_tcg)',  count(*) filter (where source='pokemon_tcg')::text,
    round(100.0*count(*) filter (where source='pokemon_tcg')/nullif(count(*),0),1)||'%' from joined
  union all select 5, '  no price at all',        count(*) filter (where source is null)::text,
    round(100.0*count(*) filter (where source is null)/nullif(count(*),0),1)||'%' from joined
  union all select 6, 'real per-condition prices',count(*) filter (where has_condition)::text,
    round(100.0*count(*) filter (where has_condition)/nullif(count(*),0),1)||'%' from joined
  union all select 7, 'fresh (<6h)',              count(*) filter (where updated_at > now()-interval '6 hours')::text,
    round(100.0*count(*) filter (where updated_at > now()-interval '6 hours')/nullif(count(*),0),1)||'%' from joined
  union all select 8, 'stale (>24h)',             count(*) filter (where updated_at < now()-interval '24 hours')::text,
    round(100.0*count(*) filter (where updated_at < now()-interval '24 hours')/nullif(count(*),0),1)||'%' from joined
  union all select 9, 'graded items',             count(*) filter (where is_graded)::text,
    round(100.0*count(*) filter (where is_graded)/nullif(count(*),0),1)||'%' from joined
  union all select 10,'  graded w/ real median',  count(*) filter (where is_graded and has_graded_median)::text,
    round(100.0*count(*) filter (where is_graded and has_graded_median)/nullif(count(*) filter (where is_graded),0),1)||'% of graded' from joined
) m
order by ord;
