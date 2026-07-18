/**
 * Build (or refresh) the shared `set_cards` catalog — the per-set checklist that
 * powers master-set completion tracking. One row per (set_code, card_number),
 * matched to ownership on the normalized collector number (resilient to the fact
 * that our `cards` catalog isn't deduped and `pokemon_api_id` may be absent).
 *
 *   pnpm sets:index                 # rebuild every set pokemontcg.io knows
 *   pnpm sets:index --set sv8       # rebuild a single set (fast, for tuning)
 *
 * Sources:
 *   1. pokemontcg.io — full card list per set (id,name,number,rarity,tcgplayer,
 *      images), keyed by set.id === cards.set_code. Primary + authoritative for
 *      the finish denominator (tcgplayer.prices keys enumerate the printings).
 *   2. Our own `cards` table — any card a user has actually added whose set_code
 *      matches a known set but that pokemontcg.io didn't return (promos, late
 *      indexing). Ensures ownership can always be represented (source='catalog',
 *      fidelity='partial').
 *
 * Re-run after each new set release (or when a new set's completion looks short).
 */
export {};

const PTCG_BASE = "https://api.pokemontcg.io/v2";

interface PtcgSet {
  id: string;
  name: string;
  series?: string;
  releaseDate?: string;
  total?: number;
  printedTotal?: number;
}

interface PtcgCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  images?: { small?: string; large?: string };
  tcgplayer?: { prices?: Record<string, unknown> };
}

interface SetCardRow {
  set_code: string;
  set_name: string;
  card_number: string;
  card_number_raw: string | null;
  name: string;
  rarity: string | null;
  image_url: string | null;
  finishes: string[];
  pokemon_api_id: string | null;
  tcgplayer_id: string | null;
  source: string;
  variant_fidelity: string;
}

async function fetchJsonWithRetry(
  url: string,
  headers: Record<string, string> = {},
  tries = 4,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
}

async function main() {
  try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }

  const setArgIdx = process.argv.indexOf("--set");
  // --set accepts a single id or a comma-separated list (e.g. --set sv9,sv10,me4).
  const onlySets = setArgIdx >= 0
    ? (process.argv[setArgIdx + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const { createAdminClient } = await import("@/utils/supabase/admin");
  const { normalizeCardNumber } = await import("@/lib/search/cardNumber");
  const { deriveFinishes } = await import("@/lib/sets/setCardFinishes");
  const { PokemonTCGProvider } = await import("@/lib/search/PokemonTCGProvider");
  const admin = createAdminClient();
  const provider = new PokemonTCGProvider();

  const headers: Record<string, string> = process.env.POKEMON_TCG_API_KEY
    ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
    : {};

  // ---- 1. Set list ---------------------------------------------------------
  // Newest-first: the sets users most want (and most often query) build first, so
  // a rate-limited full run surfaces current sets early instead of dead last.
  let sets: PtcgSet[];
  if (onlySets) {
    sets = [];
    for (const id of onlySets) {
      const json = (await fetchJsonWithRetry(
        `${PTCG_BASE}/sets/${encodeURIComponent(id)}`, headers,
      )) as { data?: PtcgSet };
      if (json.data) sets.push(json.data);
    }
  } else {
    const json = (await fetchJsonWithRetry(
      `${PTCG_BASE}/sets?pageSize=250&orderBy=-releaseDate&select=id,name,series,releaseDate,total,printedTotal`, headers,
    )) as { data?: PtcgSet[] };
    sets = json.data ?? [];
  }
  console.log(`sets to build: ${sets.length}`);

  let totalRows = 0;

  for (const set of sets) {
    const year = set.releaseDate ? Number(set.releaseDate.slice(0, 4)) : null;
    const rowsByNumber = new Map<string, SetCardRow>();

    // ---- 2. pokemontcg.io cards for this set -------------------------------
    let page = 1;
    for (;;) {
      const json = (await fetchJsonWithRetry(
        `${PTCG_BASE}/cards?q=set.id:${set.id}&page=${page}&pageSize=250&orderBy=number` +
          `&select=id,name,number,rarity,images,tcgplayer`,
        headers,
      )) as { data?: PtcgCard[]; totalCount?: number };
      const batch = json.data ?? [];
      for (const c of batch) {
        const num = normalizeCardNumber(c.number);
        if (!num) continue;
        const rarityKey = c.rarity ? provider.mapRarity(c.rarity) || null : null;
        const priceKeys = Object.keys(c.tcgplayer?.prices ?? {});
        const { finishes, fidelity } = deriveFinishes({ priceKeys, rarityKey, setReleaseYear: year });
        rowsByNumber.set(num, {
          set_code: set.id,
          set_name: set.name,
          card_number: num,
          card_number_raw: c.number,
          name: c.name,
          rarity: rarityKey,
          image_url: c.images?.small ?? c.images?.large ?? null,
          finishes,
          pokemon_api_id: c.id,
          tcgplayer_id: null,
          source: "pokemontcg",
          variant_fidelity: fidelity,
        });
      }
      const got = page * 250;
      if (batch.length === 0 || got >= (json.totalCount ?? 0)) break;
      page++;
    }

    // ---- 3. Gap-fill from our own catalog (cards a user added, missing above) --
    const { data: ownCards } = await admin
      .from("cards")
      .select("name, card_number, image_url, game_data")
      .eq("set_code", set.id);
    for (const row of ownCards ?? []) {
      const num = normalizeCardNumber(String(row.card_number ?? ""));
      if (!num || rowsByNumber.has(num)) continue;
      const gd = (row.game_data ?? {}) as { rarity?: string; pokemon_api_id?: string; tcgplayer_id?: string };
      const rarityKey = gd.rarity || null;
      const { finishes } = deriveFinishes({ priceKeys: [], rarityKey, setReleaseYear: year });
      rowsByNumber.set(num, {
        set_code: set.id,
        set_name: set.name,
        card_number: num,
        card_number_raw: String(row.card_number ?? ""),
        name: String(row.name ?? ""),
        rarity: rarityKey,
        image_url: (row.image_url as string) ?? null,
        finishes,
        pokemon_api_id: gd.pokemon_api_id ?? null,
        tcgplayer_id: gd.tcgplayer_id ?? null,
        source: "catalog",
        variant_fidelity: "partial", // no price data → best-guess finishes
      });
    }

    const rows = [...rowsByNumber.values()];
    if (rows.length === 0) {
      console.log(`  ${set.id} (${set.name}): 0 cards — skipped`);
      continue;
    }
    const { error } = await admin
      .from("set_cards")
      .upsert(rows, { onConflict: "set_code,card_number" });
    if (error) {
      console.error(`  ${set.id} upsert failed: ${error.message}`);
    } else {
      totalRows += rows.length;
      console.log(`  ${set.id} (${set.name}): ${rows.length} cards (declared total ${set.total ?? "?"})`);
    }
  }

  console.log(`done: ${totalRows} set_cards rows across ${sets.length} sets`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
