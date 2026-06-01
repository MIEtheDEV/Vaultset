create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  body         text not null check (char_length(body) <= 140),
  display_name text,
  approved     boolean not null default false,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists reviews_approved_idx on reviews(approved);
create index if not exists reviews_user_id_idx  on reviews(user_id);

-- One review per user
create unique index if not exists reviews_user_id_unique on reviews(user_id);

alter table reviews enable row level security;

create policy "Users can insert their own review"
  on reviews for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own review"
  on reviews for update
  using (auth.uid() = user_id);

create policy "Approved reviews are publicly readable"
  on reviews for select
  using (approved = true or auth.uid() = user_id);
