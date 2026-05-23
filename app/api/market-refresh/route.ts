import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

const OWNER_EMAIL   = "bmiethe90@gmail.com";
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;
const API_BASE      = "https://api.pokemontcg.io/v2";
const BATCH_SIZE    = 50;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isOwner = user.email === OWNER_EMAIL;
  const admin   = createAdminClient();

  if (!isOwner) {
    const { data: log } = await admin
      .from("market_refresh_log")
      .select("refreshed_at")
      .eq("user_id", user.id)
      .single();

    if (log) {
      const elapsed = Date.now() - new Date(log.refreshed_at).getTime();
      if (elapsed < RATE_LIMIT_MS) {
        const nextAllowedAt = new Date(new Date(log.refreshed_at).getTime() + RATE_LIMIT_MS).toISOString();
        return NextResponse.json({ error: "Rate limited", nextAllowedAt }, { status: 429 });
      }
    }
  }

  const { data: items } = await supabase
    .from("collection_items")
    .select("id, finish, cards ( game_data )")
    .eq("user_id", user.id);

  type Entry = { itemId: string; finish: string | null; edition: string | null };
  const byApiId = new Map<string, Entry[]>();

  for (const item of items ?? []) {
    const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
    const gd   = ((card as any)?.game_data ?? {}) as Record<string, unknown>;
    const apiId = gd.pokemon_api_id as string | undefined;
    if (!apiId) continue;

    const entry: Entry = {
      itemId:  item.id,
      finish:  (item as any).finish  ?? null,
      edition: (gd.edition as string) ?? null,
    };
    if (!byApiId.has(apiId)) byApiId.set(apiId, []);
    byApiId.get(apiId)!.push(entry);
  }

  const provider = new PokemonTCGProvider();
  const headers: Record<string, string> = process.env.POKEMON_TCG_API_KEY
    ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
    : {};

  // Fetch prices from pokemontcg.io in parallel batches
  const ids     = [...byApiId.keys()];
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));

  const priceMap = new Map<string, TcgPlayerData | null>();

  await Promise.allSettled(
    batches.map(async (batch) => {
      const q      = batch.map((id) => `id:${id}`).join(" OR ");
      const params = new URLSearchParams({ q, select: "id,tcgplayer", pageSize: String(batch.length) });
      const res    = await fetch(`${API_BASE}/cards?${params}`, { headers });
      if (!res.ok) return;
      const json: { data: { id: string; tcgplayer?: TcgPlayerData }[] } = await res.json();
      for (const card of json.data ?? []) priceMap.set(card.id, card.tcgplayer ?? null);
    }),
  );

  // Build per-item updates
  const updates: { id: string; market_price: number }[] = [];
  for (const [apiId, entries] of byApiId) {
    const tcgplayer = priceMap.get(apiId);
    for (const entry of entries) {
      const price = provider.getMarketPrice(tcgplayer, entry.finish, entry.edition);
      if (price != null) updates.push({ id: entry.itemId, market_price: price });
    }
  }

  // Apply updates in parallel
  const results = await Promise.all(
    updates.map((u) =>
      supabase
        .from("collection_items")
        .update({ market_price: u.market_price })
        .eq("id", u.id),
    ),
  );
  const updated = results.filter((r) => !r.error).length;

  await admin
    .from("market_refresh_log")
    .upsert({ user_id: user.id, refreshed_at: new Date().toISOString() });

  return NextResponse.json({ updated });
}
