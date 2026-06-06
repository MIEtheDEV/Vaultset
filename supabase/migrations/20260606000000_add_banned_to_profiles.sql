alter table profiles add column if not exists banned boolean not null default false;

create index if not exists profiles_banned_idx on profiles (banned);
