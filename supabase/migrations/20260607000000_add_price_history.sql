-- Daily price history snapshots per collection item
create table if not exists price_history (
  id                uuid        primary key default gen_random_uuid(),
  collection_item_id uuid       not null references collection_items(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  market_price      numeric,
  snapshotted_at    date        not null default current_date,
  created_at        timestamptz not null default now(),
  unique (collection_item_id, snapshotted_at)
);

create index if not exists price_history_item_date_idx on price_history (collection_item_id, snapshotted_at desc);
create index if not exists price_history_user_date_idx on price_history (user_id, snapshotted_at desc);

-- RLS: users can only read their own price history
alter table price_history enable row level security;

create policy "Users can read own price history"
  on price_history for select
  using (auth.uid() = user_id);

-- Service role writes snapshots (cron job runs as service role)
create policy "Service role can insert price history"
  on price_history for insert
  with check (true);

-- Function: snapshot current market_price for all collection items
create or replace function snapshot_price_history()
returns void
language plpgsql
security definer
as $$
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

-- Schedule daily snapshot at 02:00 UTC via pg_cron
-- Requires pg_cron extension enabled on your Supabase project (Pro plan).
-- Enable in Supabase Dashboard → Database → Extensions → pg_cron, then run this migration.
select cron.schedule(
  'daily-price-snapshot',
  '0 2 * * *',
  'select snapshot_price_history()'
);
