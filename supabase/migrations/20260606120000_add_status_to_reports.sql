create table if not exists reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason           text not null,
  status           text not null default 'open'
                     check (status in ('open', 'reviewed', 'dismissed')),
  notes            text,
  created_at       timestamptz not null default now()
);

-- Safe to run even if table already existed without these columns
alter table reports add column if not exists status text not null default 'open'
  check (status in ('open', 'reviewed', 'dismissed'));
alter table reports add column if not exists notes text;

create index if not exists reports_status_idx     on reports (status);
create index if not exists reports_created_at_idx on reports (created_at desc);
