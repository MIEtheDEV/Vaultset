-- Badge check function: evaluates all badge thresholds for a user server-side.
-- Returns an array of earned badge slugs. Called once per dashboard load, replacing
-- the need for many individual count queries in TypeScript.
create or replace function check_user_badges(p_user_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slugs    text[] := '{}';
  v_count    bigint;
  v_bool     bool;
  v_specialty     text;
  v_bio           text;
  v_city          text;
  v_featured      uuid;
  v_created_at    timestamptz;
begin

  -- ── SEALED PRODUCTS ──────────────────────────────────────────────────────────
  select count(*) into v_count from product_purchases where user_id = p_user_id;
  if v_count >= 1  then v_slugs := array_append(v_slugs, 'sealed_collector'); end if;
  if v_count >= 10 then v_slugs := array_append(v_slugs, 'box_hoarder'); end if;

  -- ── PACK REVEALS ─────────────────────────────────────────────────────────────
  select count(*) into v_count from pack_reveals where user_id = p_user_id;
  if v_count >= 1   then v_slugs := array_append(v_slugs, 'pack_logger'); end if;
  if v_count >= 50  then v_slugs := array_append(v_slugs, 'prolific_puller'); end if;
  if v_count >= 150 then v_slugs := array_append(v_slugs, 'box_breaker'); end if;

  -- ── TRANSACTIONS (completed offers) ──────────────────────────────────────────
  -- Any role (buyer or seller)
  select count(*) into v_count
  from offers
  where (sender_id = p_user_id or recipient_id = p_user_id)
    and status in ('accepted', 'completed');
  if v_count >= 1  then v_slugs := array_append(v_slugs, 'deal_maker'); end if;
  if v_count >= 50 then v_slugs := array_append(v_slugs, 'volume_trader'); end if;

  -- As seller (recipient)
  select count(*) into v_count
  from offers
  where recipient_id = p_user_id
    and status in ('accepted', 'completed');
  if v_count >= 10 then v_slugs := array_append(v_slugs, 'trusted_seller'); end if;

  -- As buyer (sender)
  select count(*) into v_count
  from offers
  where sender_id = p_user_id
    and status in ('accepted', 'completed');
  if v_count >= 10 then v_slugs := array_append(v_slugs, 'trusted_buyer'); end if;

  -- Bundle offers completed
  select count(*) into v_count
  from offers
  where (sender_id = p_user_id or recipient_id = p_user_id)
    and offer_type = 'bundle'
    and status in ('accepted', 'completed');
  if v_count >= 1 then v_slugs := array_append(v_slugs, 'deal_bundler'); end if;

  -- ── NEGOTIATIONS (counter-offers sent) ───────────────────────────────────────
  -- parent_offer_id may not exist if the offer-system migration hasn't been applied.
  begin
    execute
      'select count(*) from offers where sender_id = $1 and parent_offer_id is not null'
      into v_count using p_user_id;
    if v_count >= 5 then v_slugs := array_append(v_slugs, 'negotiator'); end if;
  exception when undefined_column then
    null; -- migration not yet applied; skip badge
  end;

  -- ── WATCHLIST ────────────────────────────────────────────────────────────────
  select count(*) into v_count from watchlist where user_id = p_user_id;
  if v_count >= 10 then v_slugs := array_append(v_slugs, 'deal_watcher'); end if;

  -- ── WISHLIST ─────────────────────────────────────────────────────────────────
  select count(*) into v_count from wishlist_items where user_id = p_user_id;
  if v_count >= 10 then v_slugs := array_append(v_slugs, 'wishlist_curator'); end if;
  if v_count >= 25 then v_slugs := array_append(v_slugs, 'serious_hunter'); end if;

  select count(*) into v_count
  from wishlist_items where user_id = p_user_id and target_price is not null;
  if v_count >= 5 then v_slugs := array_append(v_slugs, 'deal_hunter'); end if;

  -- ── MESSAGES SENT ────────────────────────────────────────────────────────────
  select count(*) into v_count from messages where sender_id = p_user_id;
  if v_count >= 25  then v_slugs := array_append(v_slugs, 'conversationalist'); end if;
  if v_count >= 100 then v_slugs := array_append(v_slugs, 'community_voice'); end if;

  -- ── REVIEWS SUBMITTED ────────────────────────────────────────────────────────
  select count(*) into v_count from reviews where user_id = p_user_id;
  if v_count >= 1 then v_slugs := array_append(v_slugs, 'reviewer'); end if;

  -- ── MUTUAL FOLLOWS ───────────────────────────────────────────────────────────
  select count(*) into v_count
  from follows f1
  join follows f2
    on f1.follower_id  = f2.following_id
   and f1.following_id = f2.follower_id
  where f1.follower_id = p_user_id;
  if v_count >= 5 then v_slugs := array_append(v_slugs, 'mutual_collector'); end if;

  -- ── PRICE HISTORY DEPTH ──────────────────────────────────────────────────────
  select count(distinct snapshotted_at) into v_count
  from price_history where user_id = p_user_id;
  if v_count >= 30 then v_slugs := array_append(v_slugs, 'price_historian'); end if;

  -- ── PERFECT GRADE ────────────────────────────────────────────────────────────
  select count(*) into v_count
  from collection_items
  where user_id = p_user_id
    and grader is not null
    and grade ~ '^\d+(\.\d+)?$'
    and grade::numeric >= 9.5;
  if v_count >= 1 then v_slugs := array_append(v_slugs, 'perfect_grade'); end if;

  -- ── DUAL LISTER ──────────────────────────────────────────────────────────────
  select (
    exists (select 1 from collection_items where user_id = p_user_id and for_sale  = true limit 1) and
    exists (select 1 from collection_items where user_id = p_user_id and for_trade = true limit 1)
  ) into v_bool;
  if v_bool then v_slugs := array_append(v_slugs, 'dual_lister'); end if;

  -- ── MULTI-FORMAT ─────────────────────────────────────────────────────────────
  select (
    exists (select 1 from collection_items  where user_id = p_user_id limit 1) and
    exists (select 1 from product_purchases where user_id = p_user_id limit 1)
  ) into v_bool;
  if v_bool then v_slugs := array_append(v_slugs, 'multi_format'); end if;

  -- ── ROI POSITIVE ─────────────────────────────────────────────────────────────
  select coalesce(
    sum(coalesce(market_price, list_price, 0) * coalesce(quantity, 1)) >
    sum(coalesce(paid_price, 0) * coalesce(quantity, 1)),
    false
  ) into v_bool
  from collection_items
  where user_id = p_user_id
    and paid_price is not null
    and paid_price > 0;
  if v_bool then v_slugs := array_append(v_slugs, 'roi_positive'); end if;

  -- ── PROFILE: SPECIALTY, COMPLETENESS, LONGEVITY ──────────────────────────────
  select specialty, bio, city, featured_item_id, created_at
  into v_specialty, v_bio, v_city, v_featured, v_created_at
  from profiles where id = p_user_id;

  if v_specialty is not null then
    v_slugs := array_append(v_slugs, 'specialist');
  end if;
  if v_specialty is not null
    and v_bio      is not null and length(trim(v_bio)) > 0
    and v_city     is not null and length(trim(v_city)) > 0
    and v_featured is not null
  then
    v_slugs := array_append(v_slugs, 'complete_profile');
  end if;

  if v_created_at is not null then
    if now() - v_created_at >= interval '6 months' then
      v_slugs := array_append(v_slugs, 'founding_collector');
    end if;
    if now() - v_created_at >= interval '1 year' then
      v_slugs := array_append(v_slugs, 'veteran');
    end if;
  end if;

  return v_slugs;
end;
$$;

-- Allow authenticated users to call the function on themselves.
-- The security definer ensures row-level security is bypassed for the count queries.
revoke all on function check_user_badges(uuid) from public;
grant execute on function check_user_badges(uuid) to authenticated;
