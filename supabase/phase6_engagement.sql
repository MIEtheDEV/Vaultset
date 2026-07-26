-- Phase 6.1 — Daily Vault Loop
--
-- Apply in the Supabase SQL Editor, then refresh the committed snapshot with
-- `supabase db dump` (see CLAUDE.md — this repo tracks schema as a single
-- snapshot, not per-file migrations).
--
-- Idempotent: safe to re-run.
--
-- What this adds:
--   1. Visit-streak columns on `profiles` + `touch_streak()` to advance them.
--   2. A `push_digest` preference column so the daily digest is opt-out like
--      every other push type.
--   3. A pg_cron job that calls /api/digest/daily once a day.

begin;

-- ---------------------------------------------------------------------------
-- 1. Visit streak
-- ---------------------------------------------------------------------------
-- The app had no notion of when a user was last seen at all: no last_seen, no
-- login tracking, nothing time-based except profiles.created_at. The existing
-- "longevity" badges therefore had nothing real to measure.

alter table public.profiles
  add column if not exists last_active_on date,
  add column if not exists streak_days integer not null default 0,
  add column if not exists streak_best integer not null default 0;

comment on column public.profiles.last_active_on is
  'UTC date of the user''s last recorded visit. Drives streak_days.';
comment on column public.profiles.streak_days is
  'Consecutive days visited, counting today. Reset to 1 after a missed day.';
comment on column public.profiles.streak_best is
  'Longest streak_days ever reached — never decreases.';

-- Advance the streak for one user. Called once per dashboard load, after the
-- response has been flushed (never during render).
--
-- Same-day calls are a no-op, so it is safe to call on every page view.
create or replace function public.touch_streak(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
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
    -- Already counted today.
    return v_streak;
  elsif v_last = current_date - 1 then
    v_new := coalesce(v_streak, 0) + 1;
  else
    -- First ever visit, or the chain was broken.
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

alter function public.touch_streak(uuid) owner to postgres;
grant all on function public.touch_streak(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Daily-digest push preference
-- ---------------------------------------------------------------------------
-- Opt-out, matching the other push_* columns. The digest is the only
-- notification the app *initiates* rather than reacting to, so it is the one a
-- user is most likely to want off — it must be as easy to silence as the rest.

alter table public.notification_preferences
  add column if not exists push_digest boolean not null default true;

comment on column public.notification_preferences.push_digest is
  'Daily vault digest ("your vault moved $X today"). Opt-out.';

-- ---------------------------------------------------------------------------
-- 3. Daily digest cron
-- ---------------------------------------------------------------------------
-- Runs at 13:00 UTC (~8am ET / 5am PT). This MUST stay after the 02:00 UTC
-- `daily-price-snapshot` job: the digest diffs today's live value against the
-- most recent prior snapshot, so it needs that day's rows already written.
--
-- Reuses push_dispatch_config for the secret. dispatch_url points at
-- /api/push/dispatch, so we swap the path to reach the digest endpoint and keep
-- a single place to configure the deployment's base URL.

create or replace function public.run_daily_digest()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $$
declare
  v_url    text;
  v_secret text;
begin
  select dispatch_url, dispatch_secret into v_url, v_secret
  from public.push_dispatch_config where id = 1;

  -- No config = feature off. Never raise: a failed digest must not surface as a
  -- cron error page or retry storm.
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

alter function public.run_daily_digest() owner to postgres;

-- Re-schedule idempotently.
select cron.unschedule('daily-vault-digest')
where exists (select 1 from cron.job where jobname = 'daily-vault-digest');

select cron.schedule('daily-vault-digest', '0 13 * * *', $$select public.run_daily_digest();$$);

commit;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
-- select column_name from information_schema.columns
--  where table_name = 'profiles' and column_name like 'streak%' or column_name = 'last_active_on';
--
-- select jobname, schedule from cron.job order by jobname;
--
-- -- Streak advance should be idempotent within a day:
-- select public.touch_streak('<user-uuid>');  -- returns the new streak
-- select public.touch_streak('<user-uuid>');  -- returns the same number
