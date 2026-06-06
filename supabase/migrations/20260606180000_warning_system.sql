-- Cumulative warning counter on profiles
alter table profiles add column if not exists cumulative_warnings int not null default 0;

-- Per-warning audit trail
create table if not exists user_warnings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  offense_type   text not null,
  warning_number int  not null,
  report_id      uuid references reports(id) on delete set null,
  issued_by      uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists user_warnings_user_id_idx   on user_warnings (user_id);
create index if not exists user_warnings_user_type_idx on user_warnings (user_id, offense_type);

-- Admin-only audit log (notify / warn / soft_ban / ban)
create table if not exists admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete cascade,
  report_id      uuid references reports(id) on delete set null,
  action         text not null,   -- 'notify' | 'warn' | 'soft_ban' | 'ban'
  offense_type   text,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_audit_log_target_idx  on admin_audit_log (target_user_id);
create index if not exists admin_audit_log_action_idx  on admin_audit_log (action);
create index if not exists admin_audit_log_created_idx on admin_audit_log (created_at desc);

-- pg_cron: decrement cumulative_warnings by 1 on the 1st of every month
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'decrement-cumulative-warnings') then
    perform cron.schedule(
      'decrement-cumulative-warnings',
      '0 0 1 * *',
      'update profiles set cumulative_warnings = greatest(0, cumulative_warnings - 1) where cumulative_warnings > 0'
    );
  end if;
end;
$$;
