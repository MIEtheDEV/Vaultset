-- Advanced showcase customization (Pro): an animated border style applied to the
-- cards a user pins to their public profile showcase.

alter table public.profiles
  add column if not exists showcase_border text;

alter table public.profiles
  drop constraint if exists profiles_showcase_border_check;

alter table public.profiles
  add constraint profiles_showcase_border_check
  check (showcase_border is null or showcase_border in ('none', 'foil', 'gold'));

comment on column public.profiles.showcase_border is
  'Animated border style for public showcase cards: ''foil'' / ''gold'' (Pro), or ''none'' / NULL.';
