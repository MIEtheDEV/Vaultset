-- Verify that every object created by the migrations currently in
-- supabase/migrations/ actually exists in the connected database.
--
-- Why object-existence and not the migration ledger: several Vaultset
-- migrations were applied by hand in the SQL Editor (not via `supabase db
-- push`), so they never landed in supabase_migrations.schema_migrations. A
-- ledger diff would report them missing even though the schema is correct.
-- This checks the real end-state instead, so it is accurate regardless of how
-- a migration was applied. Safe to run anywhere (read-only).
--
-- Covers the 6 files on disk as of 2026-06-21. Add a row when you add a
-- migration. ❌ in the status column = that migration has NOT been fully run.

with checks(migration, object_type, object_name, present) as (

    -- 20260620120000_card_prices.sql
    select '20260620120000', 'table',  'card_prices',
           to_regclass('public.card_prices') is not null
    union all
    select '20260620120000', 'index',  'idx_card_prices_updated_at',
           to_regclass('public.idx_card_prices_updated_at') is not null
    union all
    select '20260620120000', 'policy', 'card_prices read',
           exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'card_prices'
                     and policyname = 'card_prices read')
    union all
    select '20260620120000', 'table',  'price_api_usage',
           to_regclass('public.price_api_usage') is not null

    -- 20260620130000_card_prices_condition_prices.sql
    union all
    select '20260620130000', 'column', 'card_prices.condition_prices',
           exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'card_prices'
                     and column_name = 'condition_prices')

    -- 20260620140000_card_graded_prices.sql
    union all
    select '20260620140000', 'table',  'card_graded_prices',
           to_regclass('public.card_graded_prices') is not null
    union all
    select '20260620140000', 'policy', 'card_graded_prices read',
           exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'card_graded_prices'
                     and policyname = 'card_graded_prices read')

    -- 20260621120000_wishlist_listing_match_notification.sql
    union all
    select '20260621120000', 'index',    'idx_wishlist_items_pokemon_api_id',
           to_regclass('public.idx_wishlist_items_pokemon_api_id') is not null
    union all
    select '20260621120000', 'function', 'notify_wishlist_listing_match',
           exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'notify_wishlist_listing_match')
    union all
    select '20260621120000', 'trigger',  'wishlist_listing_match_trigger',
           exists (select 1 from pg_trigger tr
                     join pg_class c on c.oid = tr.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = 'collection_items'
                     and tr.tgname = 'wishlist_listing_match_trigger'
                     and not tr.tgisinternal)

    -- 20260621130000_offer_status_enum_values.sql
    union all
    select '20260621130000', 'enum value', 'offer_status = expired',
           exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                   where t.typname = 'offer_status' and e.enumlabel = 'expired')
    union all
    select '20260621130000', 'enum value', 'offer_status = countered',
           exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                   where t.typname = 'offer_status' and e.enumlabel = 'countered')
    union all
    select '20260621130000', 'enum value', 'offer_status = completed',
           exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                   where t.typname = 'offer_status' and e.enumlabel = 'completed')

    -- 20260621140000_fix_offer_expire_trigger_recursion.sql
    -- Function must be the recursion-SAFE version (body references the depth guard),
    -- not merely present — the whole point of this migration is replacing the buggy one.
    union all
    select '20260621140000', 'function (recursion-safe)', 'vaultset_expire_stale_offers',
           exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'vaultset_expire_stale_offers'
                     and p.prosrc ilike '%pg_trigger_depth%')
    union all
    -- Trigger must be STATEMENT-level (tgtype bit 0 unset) per the fix.
    select '20260621140000', 'trigger (statement-level)', 'auto_expire_on_offer_change',
           exists (select 1 from pg_trigger tr
                     join pg_class c on c.oid = tr.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = 'offers'
                     and tr.tgname = 'auto_expire_on_offer_change'
                     and not tr.tgisinternal
                     and (tr.tgtype & 1) = 0)
)
select migration,
       object_type,
       object_name,
       case when present then '✅' else '❌ MISSING' end as status
from checks
order by migration, object_name;
