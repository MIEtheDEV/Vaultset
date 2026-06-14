-- Marketplace "Vacation Mode" — a per-seller listing pause.
-- Basic pause (`vacation_mode`) is free: it hides all of a seller's active
-- listings from the marketplace so stale listings don't hurt buyers/trust.
-- Scheduled window + auto-reply message are the Pro layer (enforcement deferred
-- to the Pro-gating step; columns are usable by everyone until then).

alter table public.profiles
  add column if not exists vacation_mode      boolean not null default false,
  add column if not exists vacation_message   text,
  add column if not exists vacation_starts_at timestamptz,
  add column if not exists vacation_ends_at   timestamptz;

comment on column public.profiles.vacation_mode is
  'Basic listing pause (free): when true, the seller''s active listings are hidden from the marketplace.';
comment on column public.profiles.vacation_message is
  'Pro auto-reply shown to buyers on paused listings/storefront (e.g. "Back on the 20th").';
comment on column public.profiles.vacation_starts_at is
  'Pro scheduled-pause start. When set with vacation_ends_at, the pause is active only within the window.';
comment on column public.profiles.vacation_ends_at is
  'Pro scheduled-pause end. The seller is treated as on vacation while now() is within the window.';
