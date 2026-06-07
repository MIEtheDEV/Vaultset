-- Achievement badges earned by users at milestone thresholds
create table if not exists user_badges (
  user_id    uuid  not null references auth.users(id) on delete cascade,
  badge_slug text  not null,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_slug)
);

create index if not exists user_badges_user_idx on user_badges (user_id);

alter table user_badges enable row level security;

-- Badges are public achievements — anyone can read them
create policy "Badges are publicly readable"
  on user_badges for select using (true);

-- Users earn their own badges (awarded server-side via user session)
create policy "Users can earn their own badges"
  on user_badges for insert with check (auth.uid() = user_id);
