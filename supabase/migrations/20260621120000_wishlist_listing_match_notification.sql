-- Real-time "a card on your wishlist was just listed" notifications.
--
-- Until now `wishlist_listing_match` had push copy (lib/notificationPush.ts) and
-- in-app rendering (app/notifications/page.tsx) but nothing ever created the row.
-- This adds the missing producer: an AFTER trigger on collection_items that, when
-- an item becomes available on the marketplace, inserts one notification per
-- collector who has that card on their wishlist.
--
-- Delivery is automatic: inserting into `notifications` fires the existing
-- push_dispatch_after_insert chokepoint, which honors each recipient's per-type
-- preference (`push_alerts`, via prefKeyForType('wishlist_listing_match')).
--
-- Matching key is pokemon_api_id: wishlist_items stores it directly, and the
-- listed card carries it in cards.game_data->>'pokemon_api_id'. Cards without one
-- (manual / JustTCG-only) have no cross-user identity, so they can't match.

-- Speeds up the per-listing wisher lookup below.
create index if not exists idx_wishlist_items_pokemon_api_id
    on wishlist_items (pokemon_api_id);

create or replace function notify_wishlist_listing_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_api_id    text;
    v_card_name text;
    v_now_available  boolean;
    v_was_available  boolean;
begin
    -- "Available on the marketplace" mirrors the marketplace query:
    -- (for_sale OR for_trade) AND NOT on_hold.
    v_now_available := (coalesce(new.for_sale, false) or coalesce(new.for_trade, false))
                       and not coalesce(new.on_hold, false);

    if tg_op = 'UPDATE' then
        v_was_available := (coalesce(old.for_sale, false) or coalesce(old.for_trade, false))
                           and not coalesce(old.on_hold, false);
    else
        v_was_available := false;
    end if;

    -- Only act on the transition into availability, not on every later edit
    -- (e.g. a price change on an already-listed card).
    if not v_now_available or v_was_available then
        return new;
    end if;

    -- Resolve the listed card's cross-user identity + display name.
    select c.game_data->>'pokemon_api_id', c.name
      into v_api_id, v_card_name
      from cards c
     where c.id = new.card_id;

    if v_api_id is null then
        return new;  -- no shared identity key; nothing to match against
    end if;

    -- One notification per wisher (never the seller), skipping anyone already
    -- told about this exact listing so relisting/unholding can't re-spam them.
    insert into notifications (user_id, type, actor_id, data)
    select w.user_id,
           'wishlist_listing_match',
           new.user_id,
           jsonb_build_object('listing_id', new.id, 'card_name', v_card_name)
      from wishlist_items w
     where w.pokemon_api_id = v_api_id
       and w.user_id <> new.user_id
       and not exists (
           select 1
             from notifications n
            where n.user_id = w.user_id
              and n.type = 'wishlist_listing_match'
              and n.data->>'listing_id' = new.id::text
       );

    return new;
end;
$$;

drop trigger if exists wishlist_listing_match_trigger on collection_items;
create trigger wishlist_listing_match_trigger
    after insert or update of for_sale, for_trade, on_hold on collection_items
    for each row
    execute function notify_wishlist_listing_match();
