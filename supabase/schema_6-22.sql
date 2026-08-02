


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."offer_status" AS ENUM (
    'pending',
    'accepted',
    'declined',
    'cancelled',
    'completed',
    'expired',
    'countered'
);


ALTER TYPE "public"."offer_status" OWNER TO "postgres";


CREATE TYPE "public"."offer_type" AS ENUM (
    'cash',
    'trade',
    'bundle'
);


ALTER TYPE "public"."offer_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_card_counts"() RETURNS TABLE("total_qty" bigint, "for_sale_qty" bigint, "for_trade_qty" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    coalesce(sum(quantity), 0)::bigint                                as total_qty,
    coalesce(sum(quantity) filter (where for_sale),  0)::bigint       as for_sale_qty,
    coalesce(sum(quantity) filter (where for_trade), 0)::bigint       as for_trade_qty
  from public.collection_items;
$$;


ALTER FUNCTION "public"."admin_card_counts"() OWNER TO "postgres";



CREATE OR REPLACE FUNCTION "public"."collector_collection_stats"() RETURNS TABLE("user_id" "uuid", "collection_value" numeric, "collection_size" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    ci.user_id,
    coalesce(sum(coalesce(ci.market_price, 0) * coalesce(ci.quantity, 1)), 0)::numeric as collection_value,
    coalesce(sum(coalesce(ci.quantity, 1)), 0)::bigint as collection_size
  from public.collection_items ci
  group by ci.user_id;
$$;


ALTER FUNCTION "public"."collector_collection_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_expire_offers"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    UPDATE offers
    SET status = 'expired'
    WHERE status = 'pending'
      AND created_at < now() - interval '7 days';
    RETURN NULL;
  END;
  $$;


ALTER FUNCTION "public"."auto_expire_offers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_edit_applicable"("p_type" "text", "p_market" numeric, "p_list" numeric) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
    select case p_type
        when 'price_market_pct' then p_market is not null
        when 'price_list_pct'   then p_list   is not null
        when 'clear_list_price' then p_list   is not null
        else true
    end;
$$;


ALTER FUNCTION "public"."bulk_edit_applicable"("p_type" "text", "p_market" numeric, "p_list" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_edit_apply"("p_filter" "jsonb", "p_action" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
    v_user    uuid := auth.uid();
    v_type    text := coalesce(p_action->>'type', '');
    v_batch   uuid;
    v_updated integer := 0;
begin
    if v_user is null then
        raise exception 'Not authenticated' using errcode = '28000';
    end if;

    if v_type not in ('price_market_pct', 'price_list_pct', 'clear_list_price',
                      'set_for_sale', 'set_for_trade') then
        raise exception 'Unknown bulk edit action: %', v_type using errcode = '22023';
    end if;

    insert into public.bulk_edit_batches (user_id, filter, action)
    values (v_user, p_filter, p_action)
    returning id into v_batch;

    insert into public.bulk_edit_item_changes (batch_id, item_id, prior)
    select v_batch,
           ci.id,
           jsonb_build_object(
               'list_price', ci.list_price,
               'for_sale',   ci.for_sale,
               'for_trade',  ci.for_trade
           )
      from public.collection_items ci
      join public.bulk_edit_match(v_user, p_filter) m on m.item_id = ci.id
     where not m.locked
       and public.bulk_edit_applicable(v_type, ci.market_price, ci.list_price);

    update public.collection_items ci
       set list_price = case v_type
               when 'price_market_pct' then public.bulk_edit_price(ci.market_price * (1 + (p_action->>'pct')::numeric / 100), p_action)
               when 'price_list_pct'   then public.bulk_edit_price(ci.list_price   * (1 + (p_action->>'pct')::numeric / 100), p_action)
               when 'clear_list_price' then null
               else ci.list_price
           end,
           for_sale  = case when v_type = 'set_for_sale'  then (p_action->>'value')::boolean else ci.for_sale  end,
           for_trade = case when v_type = 'set_for_trade' then (p_action->>'value')::boolean else ci.for_trade end
      from public.bulk_edit_item_changes ch
     where ch.batch_id = v_batch
       and ch.item_id  = ci.id
       and ci.user_id  = v_user;

    get diagnostics v_updated = row_count;

    update public.bulk_edit_batches set item_count = v_updated where id = v_batch;

    if v_updated = 0 then
        delete from public.bulk_edit_batches where id = v_batch;
        return jsonb_build_object('batchId', null, 'updated', 0);
    end if;

    delete from public.bulk_edit_batches b
     where b.user_id = v_user
       and b.id not in (
           select id from public.bulk_edit_batches
            where user_id = v_user
            order by created_at desc
            limit 10
       );

    return jsonb_build_object('batchId', v_batch, 'updated', v_updated);
end;
$$;


ALTER FUNCTION "public"."bulk_edit_apply"("p_filter" "jsonb", "p_action" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_edit_match"("p_user" "uuid", "p_filter" "jsonb") RETURNS TABLE("item_id" "uuid", "locked" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    select ci.id,
           (ci.on_hold or ci.transfer_status is not null) as locked
      from public.collection_items ci
      join public.cards c on c.id = ci.card_id
     -- p_user is caller-supplied and this function is client-callable, so it is
     -- pinned to the session's own identity. Without this, a signed-in user
     -- could pass someone else's id and enumerate their listed items.
     where p_user = auth.uid()
       and ci.user_id = p_user
       and (p_filter->'sets' is null
            or jsonb_array_length(p_filter->'sets') = 0
            or c.set_name in (select jsonb_array_elements_text(p_filter->'sets')))
       and (p_filter->'rarities' is null
            or jsonb_array_length(p_filter->'rarities') = 0
            or coalesce(c.game_data->>'rarity', '__none__')
               in (select jsonb_array_elements_text(p_filter->'rarities')))
       and (p_filter->>'minValue' is null or ci.market_price >= (p_filter->>'minValue')::numeric)
       and (p_filter->>'maxValue' is null or ci.market_price <= (p_filter->>'maxValue')::numeric)
       and (p_filter->>'forSale'  is null or ci.for_sale  = (p_filter->>'forSale')::boolean)
       and (p_filter->>'forTrade' is null or ci.for_trade = (p_filter->>'forTrade')::boolean)
       and (p_filter->>'graded' is null
            or ((p_filter->>'graded')::boolean     and ci.grader is not null)
            or (not (p_filter->>'graded')::boolean and ci.grader is null))
       and (p_filter->'conditions' is null
            or jsonb_array_length(p_filter->'conditions') = 0
            or ci.condition in (select jsonb_array_elements_text(p_filter->'conditions')));
$$;


ALTER FUNCTION "public"."bulk_edit_match"("p_user" "uuid", "p_filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_edit_preview"("p_filter" "jsonb", "p_action" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
    v_user uuid := auth.uid();
    v_type text := coalesce(p_action->>'type', '');
    v_out  jsonb;
begin
    if v_user is null then
        raise exception 'Not authenticated' using errcode = '28000';
    end if;

    with matched as (
        select m.locked, ci.market_price, ci.list_price
          from public.bulk_edit_match(v_user, p_filter) m
          join public.collection_items ci on ci.id = m.item_id
    ),
    scored as (
        select locked,
               list_price,
               public.bulk_edit_applicable(v_type, market_price, list_price) as applicable,
               case v_type
                   when 'price_market_pct' then public.bulk_edit_price(market_price * (1 + (p_action->>'pct')::numeric / 100), p_action)
                   when 'price_list_pct'   then public.bulk_edit_price(list_price   * (1 + (p_action->>'pct')::numeric / 100), p_action)
                   when 'clear_list_price' then null
                   else list_price
               end as new_price
          from matched
    )
    select jsonb_build_object(
        'matched',        count(*) filter (where not locked),
        'locked',         count(*) filter (where locked),
        'applicable',     count(*) filter (where not locked and applicable),
        'skippedNoValue', count(*) filter (where not locked and not applicable),
        'currentValue',   coalesce(sum(list_price) filter (where not locked and applicable), 0),
        'projectedValue', coalesce(sum(new_price)  filter (where not locked and applicable), 0)
    )
    into v_out
    from scored;

    return v_out;
end;
$$;


ALTER FUNCTION "public"."bulk_edit_preview"("p_filter" "jsonb", "p_action" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_edit_price"("p_raw" numeric, "p_action" "jsonb") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
    select case
        when p_raw is null then null
        else round(
            greatest(
                case coalesce(p_action->>'round', 'cent')
                    when 'whole'       then round(p_raw)
                    when 'half'        then round(p_raw * 2) / 2
                    when 'quarter'     then round(p_raw * 4) / 4
                    when 'ninety_nine' then greatest(round(p_raw) - 0.01, 0.01)
                    else round(p_raw, 2)
                end,
                greatest(coalesce((p_action->>'floor')::numeric, 0.01), 0.01)
            ),
            2
        )
    end;
$$;


ALTER FUNCTION "public"."bulk_edit_price"("p_raw" numeric, "p_action" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_edit_undo"("p_batch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
    v_user     uuid := auth.uid();
    v_restored integer := 0;
begin
    if v_user is null then
        raise exception 'Not authenticated' using errcode = '28000';
    end if;

    if not exists (
        select 1 from public.bulk_edit_batches b
         where b.id = p_batch_id and b.user_id = v_user and b.undone_at is null
    ) then
        raise exception 'Bulk edit not found or already undone' using errcode = 'P0002';
    end if;

    update public.collection_items ci
       set list_price = (ch.prior->>'list_price')::numeric,
           for_sale   = (ch.prior->>'for_sale')::boolean,
           for_trade  = (ch.prior->>'for_trade')::boolean
      from public.bulk_edit_item_changes ch
     where ch.batch_id = p_batch_id
       and ch.item_id  = ci.id
       and ci.user_id  = v_user
       and not ci.on_hold
       and ci.transfer_status is null;

    get diagnostics v_restored = row_count;

    update public.bulk_edit_batches set undone_at = now() where id = p_batch_id;

    return jsonb_build_object('restored', v_restored);
end;
$$;


ALTER FUNCTION "public"."bulk_edit_undo"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_badges"("p_user_id" "uuid") RETURNS "text"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."check_user_badges"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_wishlist_price_alerts"("p_user_id" "uuid") RETURNS TABLE("wishlist_item_id" "uuid", "card_name" "text", "listing_id" "uuid", "list_price" numeric, "seller_username" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT
      w.id          AS wishlist_item_id,
      w.card_name,
      ci.id         AS listing_id,
      ci.list_price,
      p.username    AS seller_username
    FROM wishlist_items w
    JOIN cards c
      ON (c.game_data->>'pokemon_api_id') = w.pokemon_api_id
    JOIN collection_items ci
      ON  ci.card_id    = c.id
      AND ci.for_sale   = true
      AND ci.on_hold    = false
      AND ci.list_price <= w.target_price
    JOIN profiles p
      ON p.id = ci.user_id
    WHERE w.user_id      = p_user_id
      AND w.target_price IS NOT NULL
      AND ci.user_id    != p_user_id
    LIMIT 20;
  $$;


ALTER FUNCTION "public"."check_wishlist_price_alerts"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_follow_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    INSERT INTO notifications (user_id, type, actor_id)
    VALUES (NEW.following_id, 'new_follower', NEW.follower_id);
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."create_follow_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_offer_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    INSERT INTO notifications (user_id, type, actor_id, data)
    VALUES (
      NEW.recipient_id,
      'new_offer',
      NEW.sender_id,
      jsonb_build_object(
        'offer_id',   NEW.id,
        'offer_type', NEW.offer_type,
        'listing_id', NEW.listing_id
      )
    );
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."create_offer_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_push_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'net'
    AS $$
declare
  v_url    text;
  v_secret text;
begin
  select dispatch_url, dispatch_secret into v_url, v_secret
  from public.push_dispatch_config where id = 1;

  -- No config = feature off; never block the notification insert.
  if v_url is null or v_url = '' then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-push-secret', coalesce(v_secret, '')
    ),
    body    := jsonb_build_object(
      'notification_id', new.id,
      'user_id',         new.user_id,
      'type',            new.type,
      'actor_id',        new.actor_id,
      'data',            new.data
    )
  );

  return new;
exception when others then
  -- Push is best-effort: a dispatch failure must never break notification creation.
  return new;
end;
$$;


ALTER FUNCTION "public"."dispatch_push_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_email_for_username"("p_username" "text") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT u.email
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE lower(p.username) = lower(p_username)
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_email_for_username"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_card_count"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(sum(quantity), 0)::bigint
  from public.collection_items;
$$;


ALTER FUNCTION "public"."get_platform_card_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_listed_value"() RETURNS numeric
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT COALESCE(SUM(list_price), 0)
    FROM collection_items
    WHERE for_sale  = true
      AND on_hold   = false
      AND list_price IS NOT NULL;
  $$;


ALTER FUNCTION "public"."get_platform_listed_value"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_market_value"() RETURNS numeric
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(sum(market_price * quantity), 0)
  from collection_items
  where market_price is not null;
$$;


ALTER FUNCTION "public"."get_platform_market_value"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_protected_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only the user-facing PostgREST roles are restricted. The service role and
  -- the owner/migration role bypass this guard so backend flows still work.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.is_admin            is distinct from old.is_admin            then raise exception 'profiles.is_admin cannot be modified by this role'; end if;
  if new.is_pro              is distinct from old.is_pro              then raise exception 'profiles.is_pro cannot be modified by this role'; end if;
  if new.is_supporter        is distinct from old.is_supporter        then raise exception 'profiles.is_supporter cannot be modified by this role'; end if;
  if new.pro_expires_at      is distinct from old.pro_expires_at      then raise exception 'profiles.pro_expires_at cannot be modified by this role'; end if;
  if new.pro_auto_renews     is distinct from old.pro_auto_renews     then raise exception 'profiles.pro_auto_renews cannot be modified by this role'; end if;
  if new.pro_plan            is distinct from old.pro_plan            then raise exception 'profiles.pro_plan cannot be modified by this role'; end if;
  if new.stripe_customer_id  is distinct from old.stripe_customer_id  then raise exception 'profiles.stripe_customer_id cannot be modified by this role'; end if;
  if new.banned              is distinct from old.banned              then raise exception 'profiles.banned cannot be modified by this role'; end if;
  if new.cumulative_warnings is distinct from old.cumulative_warnings then raise exception 'profiles.cumulative_warnings cannot be modified by this role'; end if;

  -- Pro-gated cosmetic / scheduling fields. Setting a foil/gold showcase border
  -- or any scheduled-vacation field (window + auto-reply) requires active Pro
  -- entitlement. Clearing them (to 'none'/null) is always allowed so lapsed
  -- users can turn them off. The basic vacation_mode toggle stays free.
  if (
       (new.showcase_border   is distinct from old.showcase_border   and coalesce(new.showcase_border, 'none') <> 'none')
    or (new.vacation_message   is distinct from old.vacation_message   and new.vacation_message   is not null)
    or (new.vacation_starts_at is distinct from old.vacation_starts_at and new.vacation_starts_at is not null)
    or (new.vacation_ends_at   is distinct from old.vacation_ends_at   and new.vacation_ends_at   is not null)
  ) then
    if not (
      old.is_pro is true
      and (old.pro_auto_renews is true or old.pro_expires_at is null or old.pro_expires_at > now())
    ) then
      raise exception 'Pro entitlement required to set showcase borders or scheduled vacation';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_profile_protected_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_review_display_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  begin
    if new.display_name is not null
       and new.display_name is distinct from (select username from public.profiles where id = new.user_id) then
      raise exception 'reviews.display_name must equal the owner''s username or be NULL (got %)', new.display_name;
    end if;
    return new;
  end; $$;


ALTER FUNCTION "public"."enforce_review_display_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_review_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  declare
    caller_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  begin
    if caller_role is null or caller_role not in ('anon', 'authenticated') then
      return new;
    end if;
    if new.approved is distinct from old.approved then
      raise exception 'Not allowed to change review approval status';
    end if;
    if new.hidden is distinct from old.hidden
       or new.moderation_flags is distinct from old.moderation_flags
       or new.body_raw is distinct from old.body_raw
       or new.anonymous is distinct from old.anonymous then
      raise exception 'Not allowed to change review moderation state';
    end if;
    if new.body is distinct from old.body then
      raise exception 'Review text must be submitted through the review form';
    end if;
    return new;
  end; $$;


ALTER FUNCTION "public"."guard_review_approval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  -- Prefer an explicitly provided username (email signup), else derive one.
  base_username := nullif(trim(new.raw_user_meta_data->>'username'), '');

  if base_username is null then
    -- Sanitise the email local part to allowed chars; fall back to the uid.
    base_username := lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-z0-9_]', '', 'gi'));
    if length(base_username) < 3 then
      base_username := 'user_' || substr(new.id::text, 1, 8);
    end if;
  end if;

  -- Ensure uniqueness by appending a numeric suffix on collision.
  final_username := base_username;
  while exists (select 1 from public.profiles where lower(username) = lower(final_username)) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;

  begin
    insert into public.profiles (id, username)
    values (new.id, final_username)
    on conflict (id) do nothing;
  exception when others then
    -- Never let profile creation block the auth signup; log and continue.
    raise warning 'handle_new_user: could not create profile for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_username_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles
  set username = new.raw_user_meta_data->>'username'
  where id = new.id;

  -- Runs after the profiles update so the invariant trigger sees the new username.
  update public.reviews
  set display_name = new.raw_user_meta_data->>'username'
  where user_id = new.id
    and display_name is not null;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_username_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."latest_prior_snapshots"("p_user_id" "uuid", "p_window_days" integer DEFAULT 30) RETURNS TABLE("collection_item_id" "uuid", "market_price" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select distinct on (ph.collection_item_id)
    ph.collection_item_id,
    ph.market_price
  from price_history ph
  where ph.user_id = p_user_id
    and ph.market_price is not null
    and ph.snapshotted_at < current_date
    and ph.snapshotted_at >= current_date - p_window_days
  order by ph.collection_item_id, ph.snapshotted_at desc;
$$;


ALTER FUNCTION "public"."latest_prior_snapshots"("p_user_id" "uuid", "p_window_days" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."latest_prior_snapshots"("p_user_id" "uuid", "p_window_days" integer) IS 'Per-item latest price_history value strictly before today, within p_window_days. Feeds the day-over-day change ticker.';


CREATE OR REPLACE FUNCTION "public"."notify_new_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_recipient uuid;
  v_preview   text;
begin
  -- Resolve the recipient from the conversation's two participants.
  select case when c.participant_1 = new.sender_id then c.participant_2
              else c.participant_1 end
    into v_recipient
  from public.conversations c
  where c.id = new.conversation_id;

  -- No recipient (shouldn't happen) or self-message: nothing to do.
  if v_recipient is null or v_recipient = new.sender_id then
    return new;
  end if;

  -- Trim a short preview for the push body; in-app copy is rebuilt from data.
  v_preview := left(coalesce(new.body, ''), 140);

  begin
    insert into public.notifications (user_id, type, actor_id, data)
    values (
      v_recipient,
      'new_message',
      new.sender_id,
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'preview',         v_preview,
        'is_system',       coalesce(new.is_system, false)
      )
    );
  exception when others then
    -- Best-effort: a notification failure must never block sending a message.
    raise warning 'notify_new_message: failed for message %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_new_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_wishlist_listing_match"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_ids uuid[];
begin
    -- "Available on the marketplace" mirrors the marketplace query:
    -- (for_sale OR for_trade) AND NOT on_hold. Only the transition *into*
    -- availability counts, not later edits to an already-listed card.
    if tg_op = 'INSERT' then
        select array_agg(n.id) into v_ids
          from new_rows n
         where (coalesce(n.for_sale, false) or coalesce(n.for_trade, false))
           and not coalesce(n.on_hold, false);
    else
        select array_agg(n.id) into v_ids
          from new_rows n
          join old_rows o on o.id = n.id
         where (coalesce(n.for_sale, false) or coalesce(n.for_trade, false))
           and not coalesce(n.on_hold, false)
           and not ((coalesce(o.for_sale, false) or coalesce(o.for_trade, false))
                    and not coalesce(o.on_hold, false));
    end if;

    perform public.notify_wishlist_matches(v_ids);
    return null;
end;
$$;


ALTER FUNCTION "public"."notify_wishlist_listing_match"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_wishlist_matches"("p_item_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    if p_item_ids is null or array_length(p_item_ids, 1) is null then
        return;
    end if;

    with candidates as (
        select ci.id                          as listing_id,
               ci.user_id                     as seller_id,
               c.game_data->>'pokemon_api_id' as api_id,
               c.name                         as card_name
          from public.collection_items ci
          join public.cards c on c.id = ci.card_id
         where ci.id = any(p_item_ids)
           and c.game_data->>'pokemon_api_id' is not null
    ),
    matches as (
        select w.user_id as wisher_id, cd.seller_id, cd.listing_id, cd.card_name
          from candidates cd
          join public.wishlist_items w on w.pokemon_api_id = cd.api_id
         where w.user_id <> cd.seller_id
           and not exists (
               select 1 from public.wishlist_listing_notices ln
                where ln.user_id = w.user_id and ln.listing_id = cd.listing_id
           )
    ),
    -- Record coverage first; the join below means only genuinely-new pairs get
    -- summarised, which keeps this correct under concurrent listings.
    recorded as (
        insert into public.wishlist_listing_notices (user_id, listing_id)
        select wisher_id, listing_id from matches
        on conflict (user_id, listing_id) do nothing
        returning user_id, listing_id
    )
    insert into public.notifications (user_id, type, actor_id, data)
    select m.wisher_id,
           'wishlist_listing_match',
           m.seller_id,
           jsonb_build_object(
               -- A representative card so the single-match payload is byte-for-byte
               -- what it always was; match_count is what the UI branches on.
               'listing_id',  (array_agg(m.listing_id order by m.card_name, m.listing_id))[1],
               'card_name',   (array_agg(m.card_name  order by m.card_name, m.listing_id))[1],
               'match_count', count(*)
           )
      from matches m
      join recorded r on r.user_id = m.wisher_id and r.listing_id = m.listing_id
     group by m.wisher_id, m.seller_id;
end;
$$;


ALTER FUNCTION "public"."notify_wishlist_matches"("p_item_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portfolio_value_history"("p_user_id" "uuid") RETURNS TABLE("snapshot_date" "date", "total_value" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    ph.snapshotted_at as snapshot_date,
    round(sum(ph.market_price * coalesce(ci.quantity, 1))::numeric, 2) as total_value
  from price_history ph
  join collection_items ci on ci.id = ph.collection_item_id
  where ph.user_id = p_user_id
    and ph.market_price is not null
  group by ph.snapshotted_at
  order by ph.snapshotted_at;
$$;


ALTER FUNCTION "public"."portfolio_value_history"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."portfolio_value_history"("p_user_id" "uuid") IS 'Daily total market value of a user''s singles, one row per snapshot date. Quantity-weighted by the item''s CURRENT quantity, matching the client-side aggregation it replaces.';


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."snapshot_price_history"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into price_history (collection_item_id, user_id, market_price, snapshotted_at)
  select
    id,
    user_id,
    market_price,
    current_date
  from collection_items
  where market_price is not null
  on conflict (collection_item_id, snapshotted_at)
    do update set market_price = excluded.market_price;
end;
$$;


ALTER FUNCTION "public"."snapshot_price_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_conversation_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
    UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."update_conversation_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  begin new.updated_at = now(); return new; end; $$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vaultset_expire_stale_offers"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."vaultset_expire_stale_offers"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid",
    "target_user_id" "uuid",
    "report_id" "uuid",
    "action" "text" NOT NULL,
    "offense_type" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bulk_edit_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "filter" "jsonb" NOT NULL,
    "action" "jsonb" NOT NULL,
    "item_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "undone_at" timestamp with time zone
);


ALTER TABLE "public"."bulk_edit_batches" OWNER TO "postgres";


COMMENT ON TABLE "public"."bulk_edit_batches" IS 'One row per applied bulk edit. Holds the filter + action for audit and powers one-click undo.';


CREATE TABLE IF NOT EXISTS "public"."bulk_edit_item_changes" (
    "batch_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "prior" "jsonb" NOT NULL
);


ALTER TABLE "public"."bulk_edit_item_changes" OWNER TO "postgres";


COMMENT ON TABLE "public"."bulk_edit_item_changes" IS 'Pre-edit snapshot of every row a bulk edit touched (list_price, for_sale, for_trade), for undo.';


CREATE TABLE IF NOT EXISTS "public"."card_add_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "source" "text" NOT NULL,
    "scan_candidate_index" integer,
    "accepted_first" boolean,
    "modified_fields" "text"[],
    "feedback" "text"
);


ALTER TABLE "public"."card_add_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_graded_prices" (
    "card_api_id" "text" NOT NULL,
    "graded" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."card_graded_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_price_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_api_id" "text" NOT NULL,
    "game" "text" DEFAULT 'pokemon'::"text" NOT NULL,
    "source" "text" NOT NULL,
    "raw" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_price_snapshots_source_check" CHECK (("source" = ANY (ARRAY['justtcg'::"text", 'tcggo'::"text", 'pokewallet'::"text", 'pokemon_tcg'::"text"])))
);


ALTER TABLE "public"."card_price_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_prices" (
    "card_api_id" "text" NOT NULL,
    "game" "text" DEFAULT 'pokemon'::"text" NOT NULL,
    "prices" "jsonb" NOT NULL,
    "tcgplayer_url" "text",
    "tcgplayer_id" "text",
    "source" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "condition_prices" "jsonb",
    "raw" "jsonb",
    CONSTRAINT "card_prices_source_check" CHECK (("source" = ANY (ARRAY['justtcg'::"text", 'tcggo'::"text", 'pokewallet'::"text", 'pokemon_tcg'::"text"])))
);


ALTER TABLE "public"."card_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game" "text" NOT NULL,
    "name" "text" NOT NULL,
    "set_name" "text" NOT NULL,
    "set_code" "text",
    "card_number" "text",
    "year" smallint,
    "image_url" "text",
    "game_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collection_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collection_id" "uuid" NOT NULL,
    "pokemon_api_id" "text" NOT NULL,
    "card_name" "text" NOT NULL,
    "set_name" "text",
    "set_id" "text",
    "card_number" "text",
    "image_url" "text",
    "rarity" "text",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."collection_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collection_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "uuid" NOT NULL,
    "condition" "text",
    "quantity" smallint DEFAULT 1 NOT NULL,
    "paid_price" numeric(10,2),
    "for_sale" boolean DEFAULT false NOT NULL,
    "for_trade" boolean DEFAULT false NOT NULL,
    "grader" "text",
    "grade" numeric(3,1),
    "cert_number" "text",
    "notes" "text",
    "acquired_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finish" "text",
    "list_price" numeric(10,2),
    "product_purchase_id" "uuid",
    "market_price" numeric(10,2),
    "on_hold" boolean DEFAULT false NOT NULL,
    "hold_offer_id" "uuid",
    "transfer_status" "text",
    "from_offer_id" "uuid",
    CONSTRAINT "collection_items_condition_check" CHECK (("condition" = ANY (ARRAY['mint'::"text", 'near_mint'::"text", 'lightly_played'::"text", 'moderately_played'::"text", 'heavily_played'::"text", 'damaged'::"text"]))),
    CONSTRAINT "collection_items_finish_check" CHECK (("finish" = ANY (ARRAY['non_holo'::"text", 'holofoil'::"text", 'reverse_holofoil'::"text", 'textured_holofoil'::"text", 'gold_etched'::"text"]))),
    CONSTRAINT "collection_items_grader_check" CHECK (("grader" = ANY (ARRAY['PSA'::"text", 'BGS'::"text", 'CGC'::"text", 'SGC'::"text"]))),
    CONSTRAINT "collection_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "collection_items_transfer_status_check" CHECK (("transfer_status" = 'pending'::"text"))
);


ALTER TABLE "public"."collection_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "type_value" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "card_total" integer,
    CONSTRAINT "collections_type_check" CHECK (("type" = ANY (ARRAY['set'::"text", 'rarity'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_mutes" (
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_mutes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_1" "uuid" NOT NULL,
    "participant_2" "uuid" NOT NULL,
    "listing_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "no_self_chat" CHECK (("participant_1" <> "participant_2")),
    CONSTRAINT "ordered_participants" CHECK (("participant_1" < "participant_2"))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "follows_no_self_follow" CHECK (("follower_id" <> "following_id"))
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_refresh_log" (
    "user_id" "uuid" NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."market_refresh_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_system" boolean DEFAULT false,
    CONSTRAINT "messages_body_check" CHECK ((("char_length"("body") > 0) AND ("char_length"("body") <= 2000)))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "push_offers" boolean DEFAULT true NOT NULL,
    "push_followers" boolean DEFAULT true NOT NULL,
    "push_alerts" boolean DEFAULT true NOT NULL,
    "push_achievements" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "push_messages" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "actor_id" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offer_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "offer_id" "uuid" NOT NULL,
    "collection_item_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "original_for_sale" boolean,
    "original_for_trade" boolean,
    CONSTRAINT "offer_items_role_check" CHECK (("role" = ANY (ARRAY['offered'::"text", 'requested'::"text"])))
);


ALTER TABLE "public"."offer_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "offer_type" "public"."offer_type" NOT NULL,
    "offer_amount" numeric(10,2),
    "message" "text",
    "status" "public"."offer_status" DEFAULT 'pending'::"public"."offer_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_offer_id" "uuid"
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pack_reveals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_purchase_id" "uuid",
    "card_id" "uuid",
    "card_name" "text" NOT NULL,
    "set_name" "text",
    "card_number" "text",
    "image_url" "text",
    "rarity" "text",
    "collection_item_id" "uuid",
    "reveal_group_id" "uuid",
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "notes" "text",
    "revealed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pack_reveals_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."pack_reveals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_api_usage" (
    "provider" "text" NOT NULL,
    "day" "date" DEFAULT (("now"() AT TIME ZONE 'utc'::"text"))::"date" NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."price_api_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collection_item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "market_price" numeric,
    "snapshotted_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."price_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "product_type" "text" NOT NULL,
    "cost" numeric(10,2) NOT NULL,
    "purchased_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'sealed'::"text" NOT NULL,
    "list_price" numeric(10,2),
    "for_sale" boolean DEFAULT false NOT NULL,
    "for_trade" boolean DEFAULT false NOT NULL,
    "tcgplayer_id" "text",
    "set_name" "text",
    "image_url" "text",
    "market_value" numeric(10,2),
    "market_value_updated_at" timestamp with time zone,
    CONSTRAINT "product_purchases_cost_check" CHECK (("cost" >= (0)::numeric)),
    CONSTRAINT "product_purchases_market_value_check" CHECK (("market_value" >= (0)::numeric)),
    CONSTRAINT "product_purchases_product_type_check" CHECK (("product_type" = ANY (ARRAY['etb'::"text", 'booster_box'::"text", 'blister'::"text", 'bundle'::"text", 'single_pack'::"text", 'collection_box'::"text", 'other'::"text"]))),
    CONSTRAINT "product_purchases_status_check" CHECK (("status" = ANY (ARRAY['sealed'::"text", 'opened'::"text"])))
);


ALTER TABLE "public"."product_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_showcase" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "collection_item_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_showcase" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_supporter" boolean DEFAULT false NOT NULL,
    "bio" "text",
    "specialty" "text",
    "featured_item_id" "uuid",
    "avatar_url" "text",
    "avatar_color" "text",
    "city" "text",
    "followers_only_offers" boolean DEFAULT false NOT NULL,
    "banned" boolean DEFAULT false NOT NULL,
    "cumulative_warnings" integer DEFAULT 0 NOT NULL,
    "featured_badge_slugs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "stripe_customer_id" "text",
    "is_pro" boolean DEFAULT false NOT NULL,
    "pro_expires_at" timestamp with time zone,
    "pro_auto_renews" boolean DEFAULT false NOT NULL,
    "pro_plan" "text",
    "showcase_border" "text",
    "vacation_mode" boolean DEFAULT false NOT NULL,
    "vacation_message" "text",
    "vacation_starts_at" timestamp with time zone,
    "vacation_ends_at" timestamp with time zone,
    "pwa_installed_at" timestamp with time zone,
    "is_admin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_pro_plan_check" CHECK ((("pro_plan" IS NULL) OR ("pro_plan" = ANY (ARRAY['subscription'::"text", 'one_time'::"text"])))),
    CONSTRAINT "profiles_showcase_border_check" CHECK ((("showcase_border" IS NULL) OR ("showcase_border" = ANY (ARRAY['none'::"text", 'foil'::"text", 'gold'::"text"]))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."pro_plan" IS 'How active Pro was obtained: ''subscription'' (recurring) or ''one_time''. NULL when the user has never purchased Pro.';



COMMENT ON COLUMN "public"."profiles"."showcase_border" IS 'Animated border style for public showcase cards: ''foil'' / ''gold'' (Pro), or ''none'' / NULL.';



COMMENT ON COLUMN "public"."profiles"."vacation_mode" IS 'Basic listing pause (free): when true, the seller''s active listings are hidden from the marketplace.';



COMMENT ON COLUMN "public"."profiles"."vacation_message" IS 'Pro auto-reply shown to buyers on paused listings/storefront (e.g. "Back on the 20th").';



COMMENT ON COLUMN "public"."profiles"."vacation_starts_at" IS 'Pro scheduled-pause start. When set with vacation_ends_at, the pause is active only within the window.';



COMMENT ON COLUMN "public"."profiles"."vacation_ends_at" IS 'Pro scheduled-pause end. The seller is treated as on vacation while now() is within the window.';



CREATE TABLE IF NOT EXISTS "public"."push_dispatch_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "dispatch_url" "text",
    "dispatch_secret" "text",
    CONSTRAINT "push_dispatch_config_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."push_dispatch_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewed'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "body" "text" NOT NULL,
    "display_name" "text",
    "approved" boolean DEFAULT false NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hidden" boolean DEFAULT false NOT NULL,
    "moderation_flags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "body_raw" "text",
    "anonymous" boolean DEFAULT false NOT NULL,
    CONSTRAINT "reviews_body_check" CHECK (("char_length"("body") <= 140)),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


COMMENT ON COLUMN "public"."reviews"."hidden" IS 'Withheld from all public surfaces (and the aggregate rating) pending admin review. Set by lib/reviews/moderation.ts on submit.';


COMMENT ON COLUMN "public"."reviews"."moderation_flags" IS 'Why the review was flagged: hate_speech | link_or_contact | profanity_masked.';


COMMENT ON COLUMN "public"."reviews"."body_raw" IS 'Original unmasked body, stored only when masking changed the text. Admin-only; lets a false positive be restored.';


COMMENT ON COLUMN "public"."reviews"."anonymous" IS 'When true the author is shown as "Anonymous collector" publicly. display_name still holds their username; only the rendering changes.';


COMMENT ON COLUMN "public"."reviews"."display_name" IS 'Always the owner''s profiles.username (or NULL). Enforced by enforce_review_display_name() — never free text.';


CREATE TABLE IF NOT EXISTS "public"."scan_diagnostics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "ocr_text" "text",
    "ocr_char_count" integer,
    "name_candidates" "text"[],
    "pool_size" integer,
    "justtcg_appended" integer,
    "confident" boolean,
    "top_matches" "jsonb",
    "result_candidates" "jsonb",
    "image_bytes" integer,
    "user_agent" "text",
    "extracted_number" "text",
    "image_path" "text",
    "reliable_number" "text",
    "number_hints" "text"[],
    "matched_via" "text",
    "match_distance" integer,
    "match_margin" integer,
    "n_frames" integer,
    "single_frame_distance" integer
);


ALTER TABLE "public"."scan_diagnostics" OWNER TO "postgres";


COMMENT ON COLUMN "public"."scan_diagnostics"."reliable_number" IS 'The reliable NNN/TTT collector number extracted server-side (extractCollectorNumber); null when no collector/total pair was visible. Measures the number-read rate distinctly from the noisy extracted_number blob.';



COMMENT ON COLUMN "public"."scan_diagnostics"."number_hints" IS 'Client-side targeted bottom-strip OCR reads (numberHints) — measures whether the on-device number pass is recovering the printed collector number.';



CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "id" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "user_id" "uuid" NOT NULL,
    "badge_slug" "text" NOT NULL,
    "earned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_warnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "offense_type" "text" NOT NULL,
    "warning_number" integer NOT NULL,
    "report_id" "uuid",
    "issued_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_warnings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."watchlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."watchlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wishlist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pokemon_api_id" "text" NOT NULL,
    "card_name" "text" NOT NULL,
    "set_name" "text" NOT NULL,
    "card_number" "text",
    "image_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_price" numeric,
    CONSTRAINT "wishlist_items_notes_check" CHECK (("char_length"("notes") <= 200))
);


ALTER TABLE "public"."wishlist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wishlist_listing_notices" (
    "user_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "notified_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wishlist_listing_notices" OWNER TO "postgres";


COMMENT ON TABLE "public"."wishlist_listing_notices" IS 'Which wisher has already been notified about which listing. Keeps the anti-respam guard exact now that one notification can summarise many listings.';


ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulk_edit_batches"
    ADD CONSTRAINT "bulk_edit_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulk_edit_item_changes"
    ADD CONSTRAINT "bulk_edit_item_changes_pkey" PRIMARY KEY ("batch_id", "item_id");



ALTER TABLE ONLY "public"."card_add_events"
    ADD CONSTRAINT "card_add_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_graded_prices"
    ADD CONSTRAINT "card_graded_prices_pkey" PRIMARY KEY ("card_api_id");



ALTER TABLE ONLY "public"."card_price_snapshots"
    ADD CONSTRAINT "card_price_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_prices"
    ADD CONSTRAINT "card_prices_pkey" PRIMARY KEY ("card_api_id", "game");



ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collection_entries"
    ADD CONSTRAINT "collection_entries_collection_id_pokemon_api_id_key" UNIQUE ("collection_id", "pokemon_api_id");



ALTER TABLE ONLY "public"."collection_entries"
    ADD CONSTRAINT "collection_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collection_items"
    ADD CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collections"
    ADD CONSTRAINT "collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_mutes"
    ADD CONSTRAINT "conversation_mutes_pkey" PRIMARY KEY ("user_id", "conversation_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id", "following_id");



ALTER TABLE ONLY "public"."market_refresh_log"
    ADD CONSTRAINT "market_refresh_log_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offer_items"
    ADD CONSTRAINT "offer_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pack_reveals"
    ADD CONSTRAINT "pack_reveals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_api_usage"
    ADD CONSTRAINT "price_api_usage_pkey" PRIMARY KEY ("provider", "day");



ALTER TABLE ONLY "public"."price_history"
    ADD CONSTRAINT "price_history_collection_item_id_snapshotted_at_key" UNIQUE ("collection_item_id", "snapshotted_at");



ALTER TABLE ONLY "public"."price_history"
    ADD CONSTRAINT "price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_purchases"
    ADD CONSTRAINT "product_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_showcase"
    ADD CONSTRAINT "profile_showcase_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_showcase"
    ADD CONSTRAINT "profile_showcase_user_id_collection_item_id_key" UNIQUE ("user_id", "collection_item_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_unique" UNIQUE ("username");



ALTER TABLE ONLY "public"."push_dispatch_config"
    ADD CONSTRAINT "push_dispatch_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scan_diagnostics"
    ADD CONSTRAINT "scan_diagnostics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_pkey" PRIMARY KEY ("user_id", "badge_slug");



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."watchlist"
    ADD CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."watchlist"
    ADD CONSTRAINT "watchlist_user_item_unique" UNIQUE ("user_id", "item_id");



ALTER TABLE ONLY "public"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist_listing_notices"
    ADD CONSTRAINT "wishlist_listing_notices_pkey" PRIMARY KEY ("user_id", "listing_id");



ALTER TABLE ONLY "public"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_user_id_pokemon_api_id_key" UNIQUE ("user_id", "pokemon_api_id");



CREATE INDEX "admin_audit_log_action_idx" ON "public"."admin_audit_log" USING "btree" ("action");



CREATE INDEX "admin_audit_log_created_idx" ON "public"."admin_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "admin_audit_log_target_idx" ON "public"."admin_audit_log" USING "btree" ("target_user_id");



CREATE INDEX "bulk_edit_batches_user_idx" ON "public"."bulk_edit_batches" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "card_add_events_created_at_idx" ON "public"."card_add_events" USING "btree" ("created_at" DESC);



CREATE INDEX "card_price_snapshots_card_idx" ON "public"."card_price_snapshots" USING "btree" ("card_api_id", "game", "fetched_at" DESC);



CREATE INDEX "cards_game_data_idx" ON "public"."cards" USING "gin" ("game_data");



CREATE INDEX "cards_game_idx" ON "public"."cards" USING "btree" ("game");



CREATE INDEX "cards_name_idx" ON "public"."cards" USING "gin" ("to_tsvector"('"english"'::"regconfig", "name"));



CREATE INDEX "cards_set_code_idx" ON "public"."cards" USING "btree" ("set_code");



CREATE INDEX "collection_entries_collection_idx" ON "public"."collection_entries" USING "btree" ("collection_id");



CREATE INDEX "collection_items_card_id_idx" ON "public"."collection_items" USING "btree" ("card_id");



CREATE INDEX "collection_items_for_sale_idx" ON "public"."collection_items" USING "btree" ("for_sale") WHERE ("for_sale" = true);



CREATE INDEX "collection_items_for_trade_idx" ON "public"."collection_items" USING "btree" ("for_trade") WHERE ("for_trade" = true);



CREATE INDEX "collection_items_product_idx" ON "public"."collection_items" USING "btree" ("product_purchase_id") WHERE ("product_purchase_id" IS NOT NULL);



CREATE INDEX "collection_items_user_id_idx" ON "public"."collection_items" USING "btree" ("user_id");



CREATE INDEX "collections_user_idx" ON "public"."collections" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "conversations_p1_idx" ON "public"."conversations" USING "btree" ("participant_1");



CREATE INDEX "conversations_p2_idx" ON "public"."conversations" USING "btree" ("participant_2");



CREATE INDEX "conversations_updated_idx" ON "public"."conversations" USING "btree" ("updated_at" DESC);



CREATE INDEX "follows_following_id_idx" ON "public"."follows" USING "btree" ("following_id");



CREATE INDEX "idx_card_prices_updated_at" ON "public"."card_prices" USING "btree" ("updated_at");



CREATE INDEX "idx_wishlist_items_pokemon_api_id" ON "public"."wishlist_items" USING "btree" ("pokemon_api_id");



CREATE INDEX "messages_conversation_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE UNIQUE INDEX "notifications_badge_earned_unique" ON "public"."notifications" USING "btree" ("user_id", (("data" ->> 'badge_slug'::"text"))) WHERE ("type" = 'badge_earned'::"text");



CREATE INDEX "notifications_user_read_idx" ON "public"."notifications" USING "btree" ("user_id", "read", "created_at" DESC);



CREATE INDEX "offers_parent_offer_id_idx" ON "public"."offers" USING "btree" ("parent_offer_id") WHERE ("parent_offer_id" IS NOT NULL);



CREATE INDEX "pack_reveals_group_id_idx" ON "public"."pack_reveals" USING "btree" ("reveal_group_id");



CREATE INDEX "pack_reveals_product_id_idx" ON "public"."pack_reveals" USING "btree" ("product_purchase_id");



CREATE INDEX "pack_reveals_revealed_at_idx" ON "public"."pack_reveals" USING "btree" ("revealed_at" DESC);



CREATE INDEX "pack_reveals_user_id_idx" ON "public"."pack_reveals" USING "btree" ("user_id");



CREATE INDEX "price_history_item_date_idx" ON "public"."price_history" USING "btree" ("collection_item_id", "snapshotted_at" DESC);



CREATE INDEX "price_history_user_date_idx" ON "public"."price_history" USING "btree" ("user_id", "snapshotted_at" DESC);



CREATE INDEX "product_purchases_user_id_idx" ON "public"."product_purchases" USING "btree" ("user_id");



CREATE INDEX "product_purchases_tcgplayer_id_idx" ON "public"."product_purchases" USING "btree" ("tcgplayer_id");



CREATE INDEX "profile_showcase_user_idx" ON "public"."profile_showcase" USING "btree" ("user_id", "added_at");



CREATE INDEX "profiles_banned_idx" ON "public"."profiles" USING "btree" ("banned");



CREATE INDEX "profiles_pwa_installed_at_idx" ON "public"."profiles" USING "btree" ("pwa_installed_at") WHERE ("pwa_installed_at" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_stripe_customer_id_idx" ON "public"."profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "profiles_username_idx" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "push_subscriptions_user_id_idx" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "reports_created_at_idx" ON "public"."reports" USING "btree" ("created_at" DESC);



CREATE INDEX "reports_status_idx" ON "public"."reports" USING "btree" ("status");



CREATE INDEX "reviews_approved_idx" ON "public"."reviews" USING "btree" ("approved");



CREATE INDEX "reviews_hidden_idx" ON "public"."reviews" USING "btree" ("hidden");



CREATE INDEX "reviews_user_id_idx" ON "public"."reviews" USING "btree" ("user_id");



CREATE UNIQUE INDEX "reviews_user_id_unique" ON "public"."reviews" USING "btree" ("user_id");



CREATE INDEX "scan_diagnostics_created_at_idx" ON "public"."scan_diagnostics" USING "btree" ("created_at" DESC);



CREATE INDEX "user_badges_user_idx" ON "public"."user_badges" USING "btree" ("user_id");



CREATE INDEX "user_warnings_user_id_idx" ON "public"."user_warnings" USING "btree" ("user_id");



CREATE INDEX "user_warnings_user_type_idx" ON "public"."user_warnings" USING "btree" ("user_id", "offense_type");



CREATE INDEX "watchlist_item_id_idx" ON "public"."watchlist" USING "btree" ("item_id");



CREATE INDEX "watchlist_user_id_idx" ON "public"."watchlist" USING "btree" ("user_id");



CREATE INDEX "wishlist_items_user_idx" ON "public"."wishlist_items" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "auto_expire_on_offer_change" AFTER INSERT OR UPDATE ON "public"."offers" FOR EACH STATEMENT EXECUTE FUNCTION "public"."vaultset_expire_stale_offers"();



CREATE OR REPLACE TRIGGER "collection_items_updated_at" BEFORE UPDATE ON "public"."collection_items" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "follows_notification_trigger" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."create_follow_notification"();



CREATE OR REPLACE TRIGGER "guard_profile_protected_columns" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_protected_columns"();



CREATE OR REPLACE TRIGGER "enforce_review_display_name" BEFORE INSERT OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_review_display_name"();



CREATE OR REPLACE TRIGGER "guard_review_approval" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."guard_review_approval"();



CREATE OR REPLACE TRIGGER "messages_bump_conversation" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_conversation_updated_at"();



CREATE OR REPLACE TRIGGER "messages_notify_new_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_message"();



CREATE OR REPLACE TRIGGER "offers_notification_trigger" AFTER INSERT ON "public"."offers" FOR EACH ROW EXECUTE FUNCTION "public"."create_offer_notification"();



CREATE OR REPLACE TRIGGER "offers_updated_at" BEFORE UPDATE ON "public"."offers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "push_dispatch_after_insert" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."dispatch_push_notification"();



CREATE OR REPLACE TRIGGER "wishlist_listing_match_insert_trigger" AFTER INSERT ON "public"."collection_items" REFERENCING NEW TABLE AS "new_rows" FOR EACH STATEMENT EXECUTE FUNCTION "public"."notify_wishlist_listing_match"();



CREATE OR REPLACE TRIGGER "wishlist_listing_match_update_trigger" AFTER UPDATE ON "public"."collection_items" REFERENCING OLD TABLE AS "old_rows" NEW TABLE AS "new_rows" FOR EACH STATEMENT EXECUTE FUNCTION "public"."notify_wishlist_listing_match"();



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulk_edit_batches"
    ADD CONSTRAINT "bulk_edit_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulk_edit_item_changes"
    ADD CONSTRAINT "bulk_edit_item_changes_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."bulk_edit_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulk_edit_item_changes"
    ADD CONSTRAINT "bulk_edit_item_changes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."collection_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_add_events"
    ADD CONSTRAINT "card_add_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."collection_entries"
    ADD CONSTRAINT "collection_entries_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collection_items"
    ADD CONSTRAINT "collection_items_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collection_items"
    ADD CONSTRAINT "collection_items_from_offer_id_fkey" FOREIGN KEY ("from_offer_id") REFERENCES "public"."offers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."collection_items"
    ADD CONSTRAINT "collection_items_hold_offer_id_fkey" FOREIGN KEY ("hold_offer_id") REFERENCES "public"."offers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."collection_items"
    ADD CONSTRAINT "collection_items_product_purchase_id_fkey" FOREIGN KEY ("product_purchase_id") REFERENCES "public"."product_purchases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."collection_items"
    ADD CONSTRAINT "collection_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collections"
    ADD CONSTRAINT "collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_mutes"
    ADD CONSTRAINT "conversation_mutes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_mutes"
    ADD CONSTRAINT "conversation_mutes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."collection_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_participant_1_fkey" FOREIGN KEY ("participant_1") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_participant_2_fkey" FOREIGN KEY ("participant_2") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_refresh_log"
    ADD CONSTRAINT "market_refresh_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offer_items"
    ADD CONSTRAINT "offer_items_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "public"."collection_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offer_items"
    ADD CONSTRAINT "offer_items_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."collection_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_parent_offer_id_fkey" FOREIGN KEY ("parent_offer_id") REFERENCES "public"."offers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pack_reveals"
    ADD CONSTRAINT "pack_reveals_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pack_reveals"
    ADD CONSTRAINT "pack_reveals_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "public"."collection_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pack_reveals"
    ADD CONSTRAINT "pack_reveals_product_purchase_id_fkey" FOREIGN KEY ("product_purchase_id") REFERENCES "public"."product_purchases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pack_reveals"
    ADD CONSTRAINT "pack_reveals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."price_history"
    ADD CONSTRAINT "price_history_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "public"."collection_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."price_history"
    ADD CONSTRAINT "price_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_purchases"
    ADD CONSTRAINT "product_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_showcase"
    ADD CONSTRAINT "profile_showcase_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "public"."collection_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_showcase"
    ADD CONSTRAINT "profile_showcase_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_featured_item_id_fkey" FOREIGN KEY ("featured_item_id") REFERENCES "public"."collection_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scan_diagnostics"
    ADD CONSTRAINT "scan_diagnostics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlist"
    ADD CONSTRAINT "watchlist_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."collection_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlist"
    ADD CONSTRAINT "watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlist_listing_notices"
    ADD CONSTRAINT "wishlist_listing_notices_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."collection_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlist_listing_notices"
    ADD CONSTRAINT "wishlist_listing_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Approved reviews are publicly readable" ON "public"."reviews" FOR SELECT USING ((("approved" = true) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Authenticated users can insert cards" ON "public"."cards" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can send offers" ON "public"."offers" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND ("sender_id" <> "recipient_id")));



CREATE POLICY "Badges are publicly readable" ON "public"."user_badges" FOR SELECT USING (true);



CREATE POLICY "Cards are publicly readable" ON "public"."cards" FOR SELECT USING (true);



CREATE POLICY "Collection entries are publicly readable" ON "public"."collection_entries" FOR SELECT USING (true);



CREATE POLICY "Collections are publicly readable" ON "public"."collections" FOR SELECT USING (true);



CREATE POLICY "Listed items are viewable by authenticated users" ON "public"."collection_items" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND (("for_sale" = true) OR ("for_trade" = true))));



CREATE POLICY "Listed sealed products are viewable by authenticated users" ON "public"."product_purchases" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND (("for_sale" = true) OR ("for_trade" = true))));



CREATE POLICY "Offer participants can read offer_items" ON "public"."offer_items" FOR SELECT USING (("offer_id" IN ( SELECT "offers"."id"
   FROM "public"."offers"
  WHERE (("offers"."sender_id" = "auth"."uid"()) OR ("offers"."recipient_id" = "auth"."uid"())))));



CREATE POLICY "Offer sender can insert offer_items" ON "public"."offer_items" FOR INSERT WITH CHECK (("offer_id" IN ( SELECT "offers"."id"
   FROM "public"."offers"
  WHERE ("offers"."sender_id" = "auth"."uid"()))));



CREATE POLICY "Parties can update offer status" ON "public"."offers" FOR UPDATE USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Parties can view their offers" ON "public"."offers" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Profiles are publicly readable" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Public reveals are readable by everyone" ON "public"."pack_reveals" FOR SELECT USING ((("visibility" = 'public'::"text") OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Service role can insert price history" ON "public"."price_history" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can manage cards" ON "public"."cards" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Showcase is publicly readable" ON "public"."profile_showcase" FOR SELECT USING (true);



CREATE POLICY "Users can add to their own collection" ON "public"."collection_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own bulk edit batches" ON "public"."bulk_edit_batches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own bulk edit changes" ON "public"."bulk_edit_item_changes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."bulk_edit_batches" "b"
  WHERE (("b"."id" = "bulk_edit_item_changes"."batch_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete from their own collection" ON "public"."collection_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own bulk edit batches" ON "public"."bulk_edit_batches" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own bulk edit changes" ON "public"."bulk_edit_item_changes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."bulk_edit_batches" "b"
  WHERE (("b"."id" = "bulk_edit_item_changes"."batch_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own reveals" ON "public"."pack_reveals" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can earn their own badges" ON "public"."user_badges" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own reveals" ON "public"."pack_reveals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own review" ON "public"."reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own product purchases" ON "public"."product_purchases" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own watchlist" ON "public"."watchlist" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own price history" ON "public"."price_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own bulk edit batches" ON "public"."bulk_edit_batches" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own collection" ON "public"."collection_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own reveals" ON "public"."pack_reveals" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own review" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own bulk edit batches" ON "public"."bulk_edit_batches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own bulk edit changes" ON "public"."bulk_edit_item_changes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."bulk_edit_batches" "b"
  WHERE (("b"."id" = "bulk_edit_item_changes"."batch_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own collection" ON "public"."collection_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own wishlist listing notices" ON "public"."wishlist_listing_notices" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage entries in own collections" ON "public"."collection_entries" USING ((EXISTS ( SELECT 1
   FROM "public"."collections" "c"
  WHERE (("c"."id" = "collection_entries"."collection_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."collections" "c"
  WHERE (("c"."id" = "collection_entries"."collection_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users manage own collections" ON "public"."collections" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own showcase" ON "public"."profile_showcase" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bulk_edit_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bulk_edit_item_changes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_add_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_graded_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "card_graded_prices read" ON "public"."card_graded_prices" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."card_price_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "card_prices read" ON "public"."card_prices" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collection_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collection_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_mutes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "follows_delete" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));



CREATE POLICY "follows_insert" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));



CREATE POLICY "follows_select" ON "public"."follows" FOR SELECT USING (true);



ALTER TABLE "public"."market_refresh_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notif_prefs_insert_own" ON "public"."notification_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "notif_prefs_select_own" ON "public"."notification_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notif_prefs_update_own" ON "public"."notification_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."offer_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own mutes delete" ON "public"."conversation_mutes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own mutes insert" ON "public"."conversation_mutes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own mutes select" ON "public"."conversation_mutes" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."pack_reveals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participants can create conversations" ON "public"."conversations" FOR INSERT WITH CHECK (((("participant_1" = "auth"."uid"()) OR ("participant_2" = "auth"."uid"())) AND ("participant_1" < "participant_2")));



CREATE POLICY "participants can send messages" ON "public"."messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "messages"."conversation_id") AND (("conversations"."participant_1" = "auth"."uid"()) OR ("conversations"."participant_2" = "auth"."uid"())))))));



CREATE POLICY "participants can view conversations" ON "public"."conversations" FOR SELECT USING ((("participant_1" = "auth"."uid"()) OR ("participant_2" = "auth"."uid"())));



CREATE POLICY "participants can view messages" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "messages"."conversation_id") AND (("conversations"."participant_1" = "auth"."uid"()) OR ("conversations"."participant_2" = "auth"."uid"()))))));



ALTER TABLE "public"."price_api_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."price_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_showcase" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_dispatch_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions_delete_own" ON "public"."push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "push_subscriptions_insert_own" ON "public"."push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "push_subscriptions_select_own" ON "public"."push_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "push_subscriptions_update_own" ON "public"."push_subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "recipients can mark messages read" ON "public"."messages" FOR UPDATE USING ((("sender_id" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "messages"."conversation_id") AND (("conversations"."participant_1" = "auth"."uid"()) OR ("conversations"."participant_2" = "auth"."uid"())))))));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scan_diagnostics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_warnings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can add to own wishlist" ON "public"."wishlist_items" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users can remove from own wishlist" ON "public"."wishlist_items" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_own_refresh_log" ON "public"."market_refresh_log" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."watchlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlist_listing_notices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wishlists are publicly viewable" ON "public"."wishlist_items" FOR SELECT USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."admin_card_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_card_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."collector_collection_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."collector_collection_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_expire_offers"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_expire_offers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_expire_offers"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_user_badges"("p_user_id" "uuid") FROM PUBLIC;
-- These follow the project's default privileges (ALL to anon/authenticated/
-- service_role, same as every other function here). anon reaching them is
-- harmless: each entry point raises on a null auth.uid(), and bulk_edit_match
-- pins p_user to the session identity.
GRANT ALL ON FUNCTION "public"."bulk_edit_applicable"("p_type" "text", "p_market" numeric, "p_list" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_edit_applicable"("p_type" "text", "p_market" numeric, "p_list" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_edit_applicable"("p_type" "text", "p_market" numeric, "p_list" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_edit_apply"("p_filter" "jsonb", "p_action" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_edit_apply"("p_filter" "jsonb", "p_action" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_edit_apply"("p_filter" "jsonb", "p_action" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_edit_match"("p_user" "uuid", "p_filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_edit_match"("p_user" "uuid", "p_filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_edit_match"("p_user" "uuid", "p_filter" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_edit_preview"("p_filter" "jsonb", "p_action" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_edit_preview"("p_filter" "jsonb", "p_action" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_edit_preview"("p_filter" "jsonb", "p_action" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_edit_price"("p_raw" numeric, "p_action" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_edit_price"("p_raw" numeric, "p_action" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_edit_price"("p_raw" numeric, "p_action" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_edit_undo"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_edit_undo"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_edit_undo"("p_batch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_user_badges"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_user_badges"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_user_badges"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_wishlist_price_alerts"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_wishlist_price_alerts"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_wishlist_price_alerts"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_offer_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_offer_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_offer_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatch_push_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."dispatch_push_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_push_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_email_for_username"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_email_for_username"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_email_for_username"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_card_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_card_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_card_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_listed_value"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_listed_value"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_listed_value"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_market_value"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_market_value"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_market_value"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_profile_protected_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_profile_protected_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_profile_protected_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_review_display_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_review_display_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_review_display_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_review_approval"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_review_approval"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_review_approval"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_username_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_username_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_username_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."latest_prior_snapshots"("p_user_id" "uuid", "p_window_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."latest_prior_snapshots"("p_user_id" "uuid", "p_window_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."latest_prior_snapshots"("p_user_id" "uuid", "p_window_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_wishlist_listing_match"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_wishlist_listing_match"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_wishlist_listing_match"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_wishlist_matches"("p_item_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."notify_wishlist_matches"("p_item_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_wishlist_matches"("p_item_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."portfolio_value_history"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."portfolio_value_history"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portfolio_value_history"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."snapshot_price_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_price_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_price_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_conversation_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_conversation_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_conversation_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vaultset_expire_stale_offers"() TO "anon";
GRANT ALL ON FUNCTION "public"."vaultset_expire_stale_offers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vaultset_expire_stale_offers"() TO "service_role";
























GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."bulk_edit_batches" TO "anon";
GRANT ALL ON TABLE "public"."bulk_edit_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."bulk_edit_batches" TO "service_role";



GRANT ALL ON TABLE "public"."bulk_edit_item_changes" TO "anon";
GRANT ALL ON TABLE "public"."bulk_edit_item_changes" TO "authenticated";
GRANT ALL ON TABLE "public"."bulk_edit_item_changes" TO "service_role";



GRANT ALL ON TABLE "public"."card_add_events" TO "anon";
GRANT ALL ON TABLE "public"."card_add_events" TO "authenticated";
GRANT ALL ON TABLE "public"."card_add_events" TO "service_role";



GRANT ALL ON TABLE "public"."card_graded_prices" TO "anon";
GRANT ALL ON TABLE "public"."card_graded_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."card_graded_prices" TO "service_role";



GRANT ALL ON TABLE "public"."card_price_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."card_price_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."card_price_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."card_prices" TO "anon";
GRANT ALL ON TABLE "public"."card_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."card_prices" TO "service_role";



GRANT ALL ON TABLE "public"."cards" TO "anon";
GRANT ALL ON TABLE "public"."cards" TO "authenticated";
GRANT ALL ON TABLE "public"."cards" TO "service_role";



GRANT ALL ON TABLE "public"."collection_entries" TO "anon";
GRANT ALL ON TABLE "public"."collection_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."collection_entries" TO "service_role";



GRANT ALL ON TABLE "public"."collection_items" TO "anon";
GRANT ALL ON TABLE "public"."collection_items" TO "authenticated";
GRANT ALL ON TABLE "public"."collection_items" TO "service_role";



GRANT ALL ON TABLE "public"."collections" TO "anon";
GRANT ALL ON TABLE "public"."collections" TO "authenticated";
GRANT ALL ON TABLE "public"."collections" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_mutes" TO "anon";
GRANT ALL ON TABLE "public"."conversation_mutes" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_mutes" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."market_refresh_log" TO "anon";
GRANT ALL ON TABLE "public"."market_refresh_log" TO "authenticated";
GRANT ALL ON TABLE "public"."market_refresh_log" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."offer_items" TO "anon";
GRANT ALL ON TABLE "public"."offer_items" TO "authenticated";
GRANT ALL ON TABLE "public"."offer_items" TO "service_role";



GRANT ALL ON TABLE "public"."offers" TO "anon";
GRANT ALL ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT ALL ON TABLE "public"."pack_reveals" TO "anon";
GRANT ALL ON TABLE "public"."pack_reveals" TO "authenticated";
GRANT ALL ON TABLE "public"."pack_reveals" TO "service_role";



GRANT ALL ON TABLE "public"."price_api_usage" TO "anon";
GRANT ALL ON TABLE "public"."price_api_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."price_api_usage" TO "service_role";



GRANT ALL ON TABLE "public"."price_history" TO "anon";
GRANT ALL ON TABLE "public"."price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."price_history" TO "service_role";



GRANT ALL ON TABLE "public"."product_purchases" TO "anon";
GRANT ALL ON TABLE "public"."product_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."product_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."profile_showcase" TO "anon";
GRANT ALL ON TABLE "public"."profile_showcase" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_showcase" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("username") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("username") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("is_supporter") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("is_supporter") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("bio") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("bio") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("specialty") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("specialty") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("featured_item_id") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("featured_item_id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("avatar_color") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("avatar_color") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("city") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("city") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("followers_only_offers") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("followers_only_offers") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("banned") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("banned") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("featured_badge_slugs") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("featured_badge_slugs") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("is_pro") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("is_pro") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("pro_expires_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("pro_expires_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("pro_auto_renews") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("pro_auto_renews") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("pro_plan") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("pro_plan") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("showcase_border") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("showcase_border") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("vacation_mode") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("vacation_mode") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("vacation_message") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("vacation_message") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("vacation_starts_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("vacation_starts_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("vacation_ends_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("vacation_ends_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("pwa_installed_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("pwa_installed_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."push_dispatch_config" TO "anon";
GRANT ALL ON TABLE "public"."push_dispatch_config" TO "authenticated";
GRANT ALL ON TABLE "public"."push_dispatch_config" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."scan_diagnostics" TO "anon";
GRANT ALL ON TABLE "public"."scan_diagnostics" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_diagnostics" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges" TO "service_role";



GRANT ALL ON TABLE "public"."user_warnings" TO "anon";
GRANT ALL ON TABLE "public"."user_warnings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_warnings" TO "service_role";



GRANT ALL ON TABLE "public"."watchlist" TO "anon";
GRANT ALL ON TABLE "public"."watchlist" TO "authenticated";
GRANT ALL ON TABLE "public"."watchlist" TO "service_role";



GRANT ALL ON TABLE "public"."wishlist_items" TO "anon";
GRANT ALL ON TABLE "public"."wishlist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlist_items" TO "service_role";



GRANT ALL ON TABLE "public"."wishlist_listing_notices" TO "anon";
GRANT ALL ON TABLE "public"."wishlist_listing_notices" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlist_listing_notices" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


-- ============================================================================
-- Master Sets feature (added 2026-07-18; applied to production via MCP).
-- Appended manually — regenerate with `supabase db dump` to normalize ordering.
-- ============================================================================

-- Shared, service-role-written per-set checklist powering master-set completion.
CREATE TABLE IF NOT EXISTS "public"."set_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "set_code" "text" NOT NULL,
    "set_name" "text" NOT NULL,
    -- Denormalized per-set (like set_name) so the hub grids can order by recency
    -- without a live pokemontcg.io fetch on the render path.
    "release_date" "date",
    "card_number" "text" NOT NULL,
    "card_number_raw" "text",
    "name" "text" NOT NULL,
    "rarity" "text",
    "image_url" "text",
    "finishes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "pokemon_api_id" "text",
    "tcgplayer_id" "text",
    "source" "text",
    "variant_fidelity" "text" DEFAULT 'derived'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "set_cards_variant_fidelity_check" CHECK (("variant_fidelity" = ANY (ARRAY['derived'::"text", 'partial'::"text"]))),
    CONSTRAINT "set_cards_unique_set_number" UNIQUE ("set_code", "card_number"),
    CONSTRAINT "set_cards_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."set_cards" OWNER TO "postgres";
CREATE INDEX IF NOT EXISTS "set_cards_set_code_idx" ON "public"."set_cards" USING "btree" ("set_code");
CREATE INDEX IF NOT EXISTS "set_cards_pokemon_api_id_idx" ON "public"."set_cards" USING "btree" ("pokemon_api_id");
-- The /pokemon/[species] hub reads set_cards by `name IN (...)`.
CREATE INDEX IF NOT EXISTS "set_cards_name_idx" ON "public"."set_cards" USING "btree" ("name");
ALTER TABLE "public"."set_cards" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Set cards are publicly readable" ON "public"."set_cards" FOR SELECT USING (true);
CREATE POLICY "Service role can manage set cards" ON "public"."set_cards" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));
GRANT ALL ON TABLE "public"."set_cards" TO "anon", "authenticated", "service_role";

-- Per-user record of completed (set, tier) — powers badges, profile, and the
-- Pro marketplace completion signals. One row per completed tier.
CREATE TABLE IF NOT EXISTS "public"."user_set_completions" (
    "user_id" "uuid" NOT NULL,
    "set_code" "text" NOT NULL,
    "tier" "text" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_set_completions_tier_check" CHECK (("tier" = ANY (ARRAY['complete'::"text", 'master'::"text"]))),
    CONSTRAINT "user_set_completions_pkey" PRIMARY KEY ("user_id", "set_code", "tier")
);
ALTER TABLE "public"."user_set_completions" OWNER TO "postgres";
ALTER TABLE ONLY "public"."user_set_completions"
    ADD CONSTRAINT "user_set_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "user_set_completions_user_idx" ON "public"."user_set_completions" USING "btree" ("user_id");
ALTER TABLE "public"."user_set_completions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Set completions are publicly readable" ON "public"."user_set_completions" FOR SELECT USING (true);
CREATE POLICY "Users record their own set completions" ON "public"."user_set_completions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
GRANT ALL ON TABLE "public"."user_set_completions" TO "anon", "authenticated", "service_role";

-- Grouped per-set totals (complete = card count, master = Σ finishes) for the index.
CREATE OR REPLACE FUNCTION "public"."set_completion_totals"()
RETURNS TABLE("set_code" "text", "set_name" "text", "complete_total" bigint, "master_total" bigint, "has_partial" boolean)
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  select
    set_code,
    min(set_name) as set_name,
    count(*) as complete_total,
    coalesce(sum(cardinality(finishes)), 0) as master_total,
    bool_or(variant_fidelity = 'partial') as has_partial
  from public.set_cards
  group by set_code;
$$;
ALTER FUNCTION "public"."set_completion_totals"() OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."set_completion_totals"() TO "anon", "authenticated", "service_role";

-- set_code → release date as one JSONB object (156 keys), so the catalog snapshot
-- (built from `cards`, which has no release date) can inherit each card's set
-- release date for recency ordering without a live pokemontcg.io fetch.
CREATE OR REPLACE FUNCTION "public"."set_release_dates"()
RETURNS "jsonb"
LANGUAGE "sql" STABLE
AS $$
  select coalesce(jsonb_object_agg(set_code, release_date), '{}'::jsonb)
  from (
    select set_code, max(release_date) as release_date
    from public.set_cards
    where release_date is not null
    group by set_code
  ) t;
$$;
ALTER FUNCTION "public"."set_release_dates"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."set_release_dates"() TO "service_role";

-- Backs the /pokemon/[species] hubs. Returns one JSONB value (not a rowset) so
-- PostgREST's max-rows cap can't silently truncate it: [{name, n}, ...] over the
-- full set_cards checklist. ~4.2k entries / ~100KB — small enough for a daily
-- unstable_cache entry, unlike the 18k-row / 4MB table itself.
CREATE OR REPLACE FUNCTION "public"."set_card_name_counts"()
RETURNS "jsonb"
LANGUAGE "sql" STABLE
AS $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'n', n)), '[]'::jsonb)
  from (
    select name, count(*)::int as n
    from public.set_cards
    where pokemon_api_id is not null
    group by name
  ) t;
$$;
ALTER FUNCTION "public"."set_card_name_counts"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."set_card_name_counts"() TO "service_role";


-- ============================================================================
-- Phase 6.1 — Daily Vault Loop (added 2026-07-26; applied to production via MCP).
-- Appended manually — regenerate with `supabase db dump` to normalize ordering.
-- Source of truth for this change: supabase/phase6_engagement.sql
-- ============================================================================

-- Visit streak. Before this the schema had no notion of when a user was last
-- seen; the existing "longevity" badges had nothing time-based to measure.
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "last_active_on" "date",
  ADD COLUMN IF NOT EXISTS "streak_days" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "streak_best" integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN "public"."profiles"."last_active_on" IS 'UTC date of the user''s last recorded visit. Drives streak_days.';
COMMENT ON COLUMN "public"."profiles"."streak_days" IS 'Consecutive days visited, counting today. Reset to 1 after a missed day.';
COMMENT ON COLUMN "public"."profiles"."streak_best" IS 'Longest streak_days ever reached — never decreases.';

-- Advance one user's streak. Same-day calls are a no-op, so it is safe to call
-- on every dashboard load. Called after the response is flushed, never during
-- render (badge awarding already writes during render — a known perf defect).
CREATE OR REPLACE FUNCTION "public"."touch_streak"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_last    date;
  v_streak  integer;
  v_new     integer;
begin
  select last_active_on, streak_days
    into v_last, v_streak
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return 0;
  end if;

  if v_last = current_date then
    return v_streak;
  elsif v_last = current_date - 1 then
    v_new := coalesce(v_streak, 0) + 1;
  else
    v_new := 1;
  end if;

  update public.profiles
     set last_active_on = current_date,
         streak_days    = v_new,
         streak_best    = greatest(coalesce(streak_best, 0), v_new)
   where id = p_user_id;

  return v_new;
end;
$$;


ALTER FUNCTION "public"."touch_streak"("uuid") OWNER TO "postgres";


-- Daily-digest push preference. Opt-out, matching the other push_* columns.
ALTER TABLE "public"."notification_preferences"
  ADD COLUMN IF NOT EXISTS "push_digest" boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN "public"."notification_preferences"."push_digest" IS 'Daily vault digest ("your vault moved $X today"). Opt-out.';


-- Fires the daily digest endpoint. Reuses push_dispatch_config for the base URL
-- and secret, swapping the path, so there is a single place to configure the
-- deployment host. Never raises: a failed digest must not surface as a cron error.
CREATE OR REPLACE FUNCTION "public"."run_daily_digest"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'net'
    AS $$
declare
  v_url    text;
  v_secret text;
begin
  select dispatch_url, dispatch_secret into v_url, v_secret
  from public.push_dispatch_config where id = 1;

  if v_url is null or v_url = '' then
    return;
  end if;

  v_url := regexp_replace(v_url, '/api/push/dispatch/?$', '/api/digest/daily');

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-push-secret', coalesce(v_secret, '')
    ),
    body    := '{}'::jsonb
  );
exception when others then
  return;
end;
$$;


ALTER FUNCTION "public"."run_daily_digest"() OWNER TO "postgres";


-- Both functions are SECURITY DEFINER in `public`, so Postgres' default PUBLIC
-- execute grant would expose them over PostgREST at /rest/v1/rpc/<name>. Neither
-- is called from a user's own client: the digest is invoked by pg_cron and
-- touch_streak via the service-role admin client. run_daily_digest is the
-- important one — left open, an anonymous caller could trigger a push fan-out to
-- every subscribed user at will.
REVOKE ALL ON FUNCTION "public"."touch_streak"("uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."touch_streak"("uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."run_daily_digest"() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."run_daily_digest"() TO "service_role";


-- pg_cron: 13:00 UTC (~8am ET). MUST stay after the 02:00 `daily-price-snapshot`
-- job — the digest diffs today's live value against the latest prior snapshot.
--   select cron.schedule('daily-vault-digest', '0 13 * * *', $$select public.run_daily_digest();$$);


-- ============================================================================
-- Phase 6.3 — First-run activation (added 2026-07-26; applied to production via MCP).
-- Appended manually — regenerate with `supabase db dump` to normalize ordering.
-- Source of truth for this change: supabase/phase6_engagement.sql
-- ============================================================================

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "onboarding_dismissed_at" timestamp with time zone;

COMMENT ON COLUMN "public"."profiles"."onboarding_dismissed_at" IS 'When the first-run checklist was dismissed, or auto-retired on completion. NULL = still showing.';

-- Column-level SELECT grants for the Phase 6 profile columns. `profiles` grants
-- SELECT per column, and ADD COLUMN does not extend an existing column grant —
-- without this the dashboard's profiles read fails for `authenticated`, profileData
-- is null, and every Pro/supporter flag derived from it reads false.
GRANT SELECT ("last_active_on", "streak_days", "streak_best", "onboarding_dismissed_at")
  ON TABLE "public"."profiles" TO "anon", "authenticated";


-- ============================================================================
-- Real name + name visibility (added 2026-08-01; applied to production via MCP).
-- Appended manually — regenerate with `supabase db dump` to normalize ordering.
-- ============================================================================

-- An optional real name, with the user choosing how much of it is public.
--
-- `display_name_public` is a STORED GENERATED column so the public string can
-- never drift from the setting that produced it, and so the raw parts never
-- have to be readable in order to render it.
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "first_name" "text",
  ADD COLUMN IF NOT EXISTS "last_name" "text",
  ADD COLUMN IF NOT EXISTS "name_visibility" "text" DEFAULT 'hidden'::"text" NOT NULL;

ALTER TABLE "public"."profiles"
  DROP CONSTRAINT IF EXISTS "profiles_name_visibility_check";

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_name_visibility_check"
  CHECK (("name_visibility" = ANY (ARRAY['hidden'::"text", 'first'::"text", 'first_initial'::"text", 'full'::"text"])));

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "display_name_public" "text"
  GENERATED ALWAYS AS (
    CASE
        WHEN ("name_visibility" = 'hidden'::"text") THEN NULL::"text"
        WHEN (("first_name" IS NULL) OR ("btrim"("first_name") = ''::"text")) THEN NULL::"text"
        WHEN ("name_visibility" = 'first'::"text") THEN "btrim"("first_name")
        WHEN ("name_visibility" = 'first_initial'::"text") THEN ("btrim"("first_name") ||
        CASE
            WHEN (("last_name" IS NULL) OR ("btrim"("last_name") = ''::"text")) THEN ''::"text"
            ELSE ((' '::"text" || "upper"("left"("btrim"("last_name"), 1))) || '.'::"text")
        END)
        WHEN ("name_visibility" = 'full'::"text") THEN ("btrim"("first_name") ||
        CASE
            WHEN (("last_name" IS NULL) OR ("btrim"("last_name") = ''::"text")) THEN ''::"text"
            ELSE (' '::"text" || "btrim"("last_name"))
        END)
        ELSE NULL::"text"
    END
  ) STORED;

COMMENT ON COLUMN "public"."profiles"."first_name" IS 'Optional real first name. Private: no anon/authenticated SELECT grant — reachable only via the service role or the owner''s own settings page.';
COMMENT ON COLUMN "public"."profiles"."last_name" IS 'Optional real last name. Private: no anon/authenticated SELECT grant — see first_name.';
COMMENT ON COLUMN "public"."profiles"."name_visibility" IS 'How much of the real name is public: hidden | first | first_initial | full. Drives display_name_public.';
COMMENT ON COLUMN "public"."profiles"."display_name_public" IS 'Generated public form of the real name, derived from first_name/last_name/name_visibility. The ONLY name column granted to anon/authenticated, and the only one collector search matches — so a hidden name part can never be confirmed by searching for it.';

-- DELIBERATELY NARROW: only the generated column is readable by anon/authenticated.
-- `profiles` grants SELECT per column, so withholding first_name/last_name/
-- name_visibility is the entire mechanism that stops a signed-in user from
-- reading — off the REST API — a name its owner chose to hide. The owner's own
-- settings page reads the raw values through the service-role client instead.
GRANT SELECT ("display_name_public") ON TABLE "public"."profiles" TO "anon", "authenticated";
