


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
  -- Only the user-facing PostgREST roles are restricted. The service role
  -- (current_user = 'service_role') and the owner/migration role ('postgres')
  -- bypass this guard so backend flows can still manage these columns.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.is_admin           is distinct from old.is_admin           then raise exception 'profiles.is_admin cannot be modified by this role'; end if;
  if new.is_pro             is distinct from old.is_pro             then raise exception 'profiles.is_pro cannot be modified by this role'; end if;
  if new.is_supporter       is distinct from old.is_supporter       then raise exception 'profiles.is_supporter cannot be modified by this role'; end if;
  if new.pro_expires_at     is distinct from old.pro_expires_at     then raise exception 'profiles.pro_expires_at cannot be modified by this role'; end if;
  if new.pro_auto_renews    is distinct from old.pro_auto_renews    then raise exception 'profiles.pro_auto_renews cannot be modified by this role'; end if;
  if new.pro_plan           is distinct from old.pro_plan           then raise exception 'profiles.pro_plan cannot be modified by this role'; end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id then raise exception 'profiles.stripe_customer_id cannot be modified by this role'; end if;
  if new.banned             is distinct from old.banned             then raise exception 'profiles.banned cannot be modified by this role'; end if;
  if new.cumulative_warnings is distinct from old.cumulative_warnings then raise exception 'profiles.cumulative_warnings cannot be modified by this role'; end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_profile_protected_columns"() OWNER TO "postgres";


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
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_username_update"() OWNER TO "postgres";


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
    v_api_id    text;
    v_card_name text;
    v_now_available  boolean;
    v_was_available  boolean;
begin
    -- "Available on the marketplace" mirrors the marketplace query:
    -- (for_sale OR for_trade) AND NOT on_hold.
    v_now_available := (coalesce(new.for_sale, false) or coalesce(new.for_trade, false))
                       and not coalesce(new.on_hold, false);

    if tg_op = 'UPDATE' then
        v_was_available := (coalesce(old.for_sale, false) or coalesce(old.for_trade, false))
                           and not coalesce(old.on_hold, false);
    else
        v_was_available := false;
    end if;

    -- Only act on the transition into availability, not on every later edit
    -- (e.g. a price change on an already-listed card).
    if not v_now_available or v_was_available then
        return new;
    end if;

    -- Resolve the listed card's cross-user identity + display name.
    select c.game_data->>'pokemon_api_id', c.name
      into v_api_id, v_card_name
      from cards c
     where c.id = new.card_id;

    if v_api_id is null then
        return new;  -- no shared identity key; nothing to match against
    end if;

    -- One notification per wisher (never the seller), skipping anyone already
    -- told about this exact listing so relisting/unholding can't re-spam them.
    insert into notifications (user_id, type, actor_id, data)
    select w.user_id,
           'wishlist_listing_match',
           new.user_id,
           jsonb_build_object('listing_id', new.id, 'card_name', v_card_name)
      from wishlist_items w
     where w.pokemon_api_id = v_api_id
       and w.user_id <> new.user_id
       and not exists (
           select 1
             from notifications n
            where n.user_id = w.user_id
              and n.type = 'wishlist_listing_match'
              and n.data->>'listing_id' = new.id::text
       );

    return new;
end;
$$;


ALTER FUNCTION "public"."notify_wishlist_listing_match"() OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."card_graded_prices" (
    "card_api_id" "text" NOT NULL,
    "graded" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."card_graded_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_prices" (
    "card_api_id" "text" NOT NULL,
    "game" "text" DEFAULT 'pokemon'::"text" NOT NULL,
    "prices" "jsonb" NOT NULL,
    "tcgplayer_url" "text",
    "tcgplayer_id" "text",
    "source" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "condition_prices" "jsonb",
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
    CONSTRAINT "product_purchases_cost_check" CHECK (("cost" >= (0)::numeric)),
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
    CONSTRAINT "reviews_body_check" CHECK (("char_length"("body") <= 140)),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


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


ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_graded_prices"
    ADD CONSTRAINT "card_graded_prices_pkey" PRIMARY KEY ("card_api_id");



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



ALTER TABLE ONLY "public"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_user_id_pokemon_api_id_key" UNIQUE ("user_id", "pokemon_api_id");



CREATE INDEX "admin_audit_log_action_idx" ON "public"."admin_audit_log" USING "btree" ("action");



CREATE INDEX "admin_audit_log_created_idx" ON "public"."admin_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "admin_audit_log_target_idx" ON "public"."admin_audit_log" USING "btree" ("target_user_id");



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



CREATE INDEX "pack_reveals_product_id_idx" ON "public"."pack_reveals" USING "btree" ("product_purchase_id");



CREATE INDEX "pack_reveals_revealed_at_idx" ON "public"."pack_reveals" USING "btree" ("revealed_at" DESC);



CREATE INDEX "pack_reveals_user_id_idx" ON "public"."pack_reveals" USING "btree" ("user_id");



CREATE INDEX "price_history_item_date_idx" ON "public"."price_history" USING "btree" ("collection_item_id", "snapshotted_at" DESC);



CREATE INDEX "price_history_user_date_idx" ON "public"."price_history" USING "btree" ("user_id", "snapshotted_at" DESC);



CREATE INDEX "product_purchases_user_id_idx" ON "public"."product_purchases" USING "btree" ("user_id");



CREATE INDEX "profile_showcase_user_idx" ON "public"."profile_showcase" USING "btree" ("user_id", "added_at");



CREATE INDEX "profiles_banned_idx" ON "public"."profiles" USING "btree" ("banned");



CREATE INDEX "profiles_pwa_installed_at_idx" ON "public"."profiles" USING "btree" ("pwa_installed_at") WHERE ("pwa_installed_at" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_stripe_customer_id_idx" ON "public"."profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "profiles_username_idx" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "push_subscriptions_user_id_idx" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "reports_created_at_idx" ON "public"."reports" USING "btree" ("created_at" DESC);



CREATE INDEX "reports_status_idx" ON "public"."reports" USING "btree" ("status");



CREATE INDEX "reviews_approved_idx" ON "public"."reviews" USING "btree" ("approved");



CREATE INDEX "reviews_user_id_idx" ON "public"."reviews" USING "btree" ("user_id");



CREATE UNIQUE INDEX "reviews_user_id_unique" ON "public"."reviews" USING "btree" ("user_id");



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



CREATE OR REPLACE TRIGGER "guard_review_approval" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."guard_review_approval"();



CREATE OR REPLACE TRIGGER "messages_bump_conversation" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_conversation_updated_at"();



CREATE OR REPLACE TRIGGER "messages_notify_new_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_message"();



CREATE OR REPLACE TRIGGER "offers_notification_trigger" AFTER INSERT ON "public"."offers" FOR EACH ROW EXECUTE FUNCTION "public"."create_offer_notification"();



CREATE OR REPLACE TRIGGER "offers_updated_at" BEFORE UPDATE ON "public"."offers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "push_dispatch_after_insert" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."dispatch_push_notification"();



CREATE OR REPLACE TRIGGER "wishlist_listing_match_trigger" AFTER INSERT OR UPDATE OF "for_sale", "for_trade", "on_hold" ON "public"."collection_items" FOR EACH ROW EXECUTE FUNCTION "public"."notify_wishlist_listing_match"();



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



CREATE POLICY "Users can delete from their own collection" ON "public"."collection_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own reveals" ON "public"."pack_reveals" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can earn their own badges" ON "public"."user_badges" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own reveals" ON "public"."pack_reveals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own review" ON "public"."reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own product purchases" ON "public"."product_purchases" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own watchlist" ON "public"."watchlist" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own price history" ON "public"."price_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own collection" ON "public"."collection_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own reveals" ON "public"."pack_reveals" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own review" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own collection" ON "public"."collection_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage entries in own collections" ON "public"."collection_entries" USING ((EXISTS ( SELECT 1
   FROM "public"."collections" "c"
  WHERE (("c"."id" = "collection_entries"."collection_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."collections" "c"
  WHERE (("c"."id" = "collection_entries"."collection_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users manage own collections" ON "public"."collections" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own showcase" ON "public"."profile_showcase" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_graded_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "card_graded_prices read" ON "public"."card_graded_prices" FOR SELECT TO "authenticated" USING (true);



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


ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_warnings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can add to own wishlist" ON "public"."wishlist_items" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users can remove from own wishlist" ON "public"."wishlist_items" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_own_refresh_log" ON "public"."market_refresh_log" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."watchlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlist_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wishlists are publicly viewable" ON "public"."wishlist_items" FOR SELECT USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."auto_expire_offers"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_expire_offers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_expire_offers"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_user_badges"("p_user_id" "uuid") FROM PUBLIC;
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



GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_wishlist_listing_match"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_wishlist_listing_match"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_wishlist_listing_match"() TO "service_role";



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



GRANT ALL ON TABLE "public"."card_graded_prices" TO "anon";
GRANT ALL ON TABLE "public"."card_graded_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."card_graded_prices" TO "service_role";



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



































