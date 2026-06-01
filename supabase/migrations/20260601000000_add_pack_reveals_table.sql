-- Pack reveals: log individual card pulls from a sealed product purchase
create table if not exists pack_reveals (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  product_purchase_id uuid references product_purchases(id) on delete set null,
  card_id             uuid references cards(id) on delete set null,
  -- Snapshot fields so the reveal is readable even if the card record changes
  card_name           text not null,
  set_name            text,
  card_number         text,
  image_url           text,
  rarity              text,
  -- The collection_item this pull added to inventory (optional)
  collection_item_id  uuid references collection_items(id) on delete set null,
  -- Visibility: 'public' shows on community feed, 'private' is owner-only
  visibility          text not null default 'public' check (visibility in ('public', 'private')),
  notes               text,
  revealed_at         timestamptz not null default now()
);

-- Indexes for common access patterns
create index if not exists pack_reveals_user_id_idx        on pack_reveals(user_id);
create index if not exists pack_reveals_product_id_idx     on pack_reveals(product_purchase_id);
create index if not exists pack_reveals_revealed_at_idx    on pack_reveals(revealed_at desc);

-- RLS: users manage their own reveals; public reveals visible to all
alter table pack_reveals enable row level security;

create policy "Users can insert their own reveals"
  on pack_reveals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own reveals"
  on pack_reveals for update
  using (auth.uid() = user_id);

create policy "Users can delete their own reveals"
  on pack_reveals for delete
  using (auth.uid() = user_id);

create policy "Public reveals are readable by everyone"
  on pack_reveals for select
  using (visibility = 'public' or auth.uid() = user_id);
