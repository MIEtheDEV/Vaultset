-- Universal push delivery: fire a web-push for *every* notification, whatever
-- created it (app code OR the SECURITY DEFINER triggers behind new_offer /
-- new_follower). An AFTER INSERT trigger on `notifications` forwards each row
-- to the app's dispatch endpoint via pg_net; the endpoint applies the user's
-- per-type preferences and sends. Per-user opt-out lives in
-- `notification_preferences` (read by the endpoint, not this trigger).

-- ── Per-type push preferences (opt-out; missing row = everything on) ──────────
create table if not exists public.notification_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  push_offers       boolean not null default true,  -- new_offer
  push_followers    boolean not null default true,  -- new_follower
  push_alerts       boolean not null default true,  -- price_alert + wishlist_listing_match
  push_achievements boolean not null default true,  -- badge_earned
  updated_at        timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notif_prefs_select_own" on public.notification_preferences;
create policy "notif_prefs_select_own"
  on public.notification_preferences for select using (auth.uid() = user_id);

drop policy if exists "notif_prefs_insert_own" on public.notification_preferences;
create policy "notif_prefs_insert_own"
  on public.notification_preferences for insert with check (auth.uid() = user_id);

drop policy if exists "notif_prefs_update_own" on public.notification_preferences;
create policy "notif_prefs_update_own"
  on public.notification_preferences for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Dispatch config (single row; locked to service-role / SECURITY DEFINER) ───
-- Set these once per environment so the trigger knows where to POST and which
-- shared secret to present (must match the PUSH_DISPATCH_SECRET env var):
--   insert into public.push_dispatch_config (id, dispatch_url, dispatch_secret)
--   values (1, 'https://vaultset.app/api/push/dispatch', '<PUSH_DISPATCH_SECRET>')
--   on conflict (id) do update
--     set dispatch_url = excluded.dispatch_url,
--         dispatch_secret = excluded.dispatch_secret;
create table if not exists public.push_dispatch_config (
  id              int  primary key default 1,
  dispatch_url    text,
  dispatch_secret text,
  constraint push_dispatch_config_singleton check (id = 1)
);

alter table public.push_dispatch_config enable row level security;
-- No policies: RLS denies all by default. The SECURITY DEFINER trigger below
-- reads it regardless; the service role bypasses RLS.

-- ── pg_net forwarder ─────────────────────────────────────────────────────────
create extension if not exists pg_net;

create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
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

drop trigger if exists push_dispatch_after_insert on public.notifications;
create trigger push_dispatch_after_insert
  after insert on public.notifications
  for each row execute function public.dispatch_push_notification();
