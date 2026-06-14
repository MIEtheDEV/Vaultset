-- Records how a member obtained Pro so we can distinguish recurring subscribers
-- from one-time payers. Subscriber-only Pro badges/titles rely on this; one-time
-- payers (Stripe checkout mode = 'payment') are intentionally excluded.

alter table public.profiles
  add column if not exists pro_plan text;

alter table public.profiles
  drop constraint if exists profiles_pro_plan_check;

alter table public.profiles
  add constraint profiles_pro_plan_check
  check (pro_plan is null or pro_plan in ('subscription', 'one_time'));

comment on column public.profiles.pro_plan is
  'How active Pro was obtained: ''subscription'' (recurring) or ''one_time''. NULL when the user has never purchased Pro.';

-- Backfill existing Pro members using the best signal available at migration time.
-- Auto-renewing => subscription; otherwise => one-time. Going forward the Stripe
-- webhook sets this authoritatively on every subscription/checkout event.
update public.profiles
set pro_plan = case when pro_auto_renews then 'subscription' else 'one_time' end
where is_pro = true and pro_plan is null;
