-- Security audit follow-up SQL — run in the Supabase SQL Editor.
-- Three sections:
--   A. REQUIRED — supports code already merged (Stripe webhook idempotency).
--   B. INSPECTION — read-only; paste the output back so RLS (H-2) can be verified.
--   C. RECOMMENDED — profiles column-lock hardening (run after reviewing B).

-- ============================================================================
-- A. REQUIRED: stripe_events table (M-2 webhook idempotency)
-- The webhook handler now inserts each processed event id here and treats a
-- unique-violation as a duplicate. Without this table idempotency silently
-- degrades (events still process, but replays are no longer deduped).
-- ============================================================================
create table if not exists public.stripe_events (
  id          text primary key,
  received_at timestamptz not null default now()
);

-- Backend-only (service-role webhook). RLS on + no policy = deny all anon/auth.
alter table public.stripe_events enable row level security;


-- ============================================================================
-- B. INSPECTION (read-only): dump RLS posture for the core tables.
--    Run each block and send me the results.
-- ============================================================================

-- B1. Which core tables have RLS enabled?
select n.nspname as schema, c.relname as table, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles','offers','offer_items','notifications','notification_preferences',
    'conversations','messages','conversation_mutes','reports','reviews',
    'collection_items','wishlist_items','push_subscriptions','follows',
    'user_warnings','admin_audit_log'
  )
order by c.relname;

-- B2. Full policy text for every policy on those tables.
select schemaname, tablename, policyname, cmd, roles,
       qual        as using_expr,
       with_check  as with_check_expr
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles','offers','offer_items','notifications','notification_preferences',
    'conversations','messages','conversation_mutes','reports','reviews',
    'collection_items','wishlist_items','push_subscriptions','follows',
    'user_warnings','admin_audit_log'
  )
order by tablename, cmd, policyname;

-- B3. SECURITY DEFINER functions and whether search_path is pinned.
select p.proname,
       p.prosecdef as security_definer,
       p.proconfig as config   -- look for "search_path=..." here
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;


-- ============================================================================
-- C. REQUIRED (C-1 — CONFIRMED EXPLOITABLE): stop users editing privileged
--    columns on their own profile row. B2 confirmed the profiles UPDATE policy
--    is USING/WITH CHECK (auth.uid() = id) with NO column guard, so any logged-in
--    user can PATCH their own row to set is_admin=true and become an admin.
--
--    This trigger rejects any change to privileged columns unless the change is
--    made by the service role (webhooks/admin actions use the service role,
--    which bypasses RLS and is exempt here).
-- ============================================================================
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  -- Only restrict PostgREST API roles. Direct DB access (SQL editor, migrations)
  -- and the service-role client are allowed through, so admins can still manage
  -- these columns from the dashboard / server code.
  if caller_role is null or caller_role not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.is_admin            is distinct from old.is_admin
     or new.banned           is distinct from old.banned
     or new.is_pro           is distinct from old.is_pro
     or new.is_supporter     is distinct from old.is_supporter
     or new.pro_expires_at   is distinct from old.pro_expires_at
     or new.pro_plan         is distinct from old.pro_plan
     or new.pro_auto_renews  is distinct from old.pro_auto_renews
     or new.cumulative_warnings is distinct from old.cumulative_warnings
     or new.stripe_customer_id  is distinct from old.stripe_customer_id  -- billing-takeover guard (H-5)
  then
    raise exception 'Not allowed to modify privileged profile columns';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_privileged_columns();


-- ============================================================================
-- D. RECOMMENDED: pin search_path on SECURITY DEFINER functions that lack it
--    (revealed by query B3). An elevated-privilege function with an unpinned
--    search_path can be hijacked via a shadowing object on the caller's path.
--    This loops only the affected functions and resolves each one's argument
--    signature automatically, so it works regardless of overloads.
--
--    Note: if any of these later error at runtime about a missing function
--    (e.g. a net.* or extension call), re-pin that one with the extra schemas,
--    e.g.  alter function public.<name>(<args>) set search_path = public, extensions, net;
-- ============================================================================
do $$
declare r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in (
        'auto_expire_offers',
        'check_wishlist_price_alerts',
        'create_follow_notification',
        'create_offer_notification',
        'get_platform_listed_value',
        'get_platform_market_value',
        'snapshot_price_history'
      )
  loop
    execute format('alter function public.%I(%s) set search_path = public', r.proname, r.args);
  end loop;
end $$;

-- Verify afterwards: re-run query B3 — every row should now show a search_path in `config`.


-- ============================================================================
-- E. REQUIRED (M-9): stop users self-approving their own reviews. The reviews
--    UPDATE policy lets a user edit their own row with no column guard, so they
--    can set approved=true and bypass admin moderation. This trigger freezes the
--    `approved` flag unless the change comes from the service role (the admin
--    review actions use the service role).
-- ============================================================================
create or replace function public.guard_review_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  -- Only restrict PostgREST API roles (see guard_profile_privileged_columns).
  if caller_role is null or caller_role not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.approved is distinct from old.approved then
    raise exception 'Not allowed to change review approval status';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_review_approval on public.reviews;
create trigger guard_review_approval
  before update on public.reviews
  for each row
  execute function public.guard_review_approval();


-- ============================================================================
-- F. RECOMMENDED (M-8 + H-5): stop exposing sensitive profile columns to the
--    world. The profiles SELECT policy is `using (true)` for {public}, so anon
--    can read every column — including stripe_customer_id (billing id),
--    is_admin, and cumulative_warnings.
--
--    The app code has already been changed so that NO authenticated/anon query
--    reads stripe_customer_id / is_admin / cumulative_warnings (billing reads now
--    use the service-role client; admin flags are admin-only). So a plain
--    column-level GRANT is now safe — no view or further app change needed. The
--    service role bypasses column grants, so all server-side reads still work.
--
--    Column grants are "grant the safe ones" (there is no grant-all-except), so
--    STEP 1 lists the real columns; STEP 2 grants everything EXCEPT the three
--    sensitive ones. Paste STEP 1's output back and I'll fill STEP 2 exactly, or
--    edit the list yourself.
-- ============================================================================

-- STEP 1: list the columns.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- STEP 2 (FINALIZED against the live column list, 2026-06-21): grant SELECT on
--   every column EXCEPT the three sensitive ones (stripe_customer_id, is_admin,
--   cumulative_warnings). `banned` is intentionally kept readable — the community
--   page filters on it and the wishlist-listings route selects it (Postgres needs
--   column SELECT to filter), and it is low-sensitivity.
revoke select on public.profiles from anon, authenticated;

grant select (
  id, username, created_at, is_supporter, bio, specialty, featured_item_id,
  avatar_url, avatar_color, city, followers_only_offers, banned,
  featured_badge_slugs, is_pro, pro_expires_at, pro_auto_renews, pro_plan,
  showcase_border, vacation_mode, vacation_message, vacation_starts_at,
  vacation_ends_at, pwa_installed_at
) on public.profiles to anon, authenticated;

-- Keep the existing `using (true)` SELECT policy — column grants are enforced on
-- top of it, so the row policy stays simple while the 3 columns are locked.
-- Verify (should error "permission denied for column stripe_customer_id"):
--   set role authenticated;
--   select stripe_customer_id from public.profiles limit 1;
--   reset role;
