alter table profiles
  add column if not exists featured_badge_slugs text[] not null default '{}';
