/**
 * Build (or refresh) the shared `set_cards` catalog — the per-set checklist that
 * powers master-set completion tracking. One row per (set_code, card_number),
 * matched to ownership on the normalized collector number (resilient to the fact
 * that our `cards` catalog isn't deduped and `pokemon_api_id` may be absent).
 *
 *   pnpm sets:index                 # rebuild every set pokemontcg.io knows
 *   pnpm sets:index --set sv8       # rebuild a single set (fast, for tuning)
 *   pnpm sets:index --set sv8 --no-warm   # skip the post-build price warm
 *
 * After (re)building, it price-warms the sets it touched — gap-only (cards with no
 * cached price) and bounded by the remaining JustTCG daily budget — so a new set's
 * card-data pages show market values immediately instead of staying blank until
 * something happens to fetch them. Newest sets warm first; pass --no-warm to skip.
 *
 * Sources:
 *   1. pokemontcg.io — full card list per set (id,name,number,rarity,tcgplayer,
 *      images), keyed by set.id === cards.set_code. Primary + authoritative for
 *      the finish denominator (tcgplayer.prices keys enumerate the printings).
 *   2. TCGdex — a backstop for two specific pokemontcg.io failures (see step 2b):
 *      printing keys when it returned no `tcgplayer.prices` for a set at all,
 *      and whole cards when it serves fewer than its own declared set `total`.
 *      Never consulted for a set pokemontcg.io is serving properly.
 *   3. Our own `cards` table — any card a user has actually added whose set_code
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
  // Denormalized per-set, like set_name — the hub grids order by it, and reading
  // it off the row keeps pokemontcg.io off the page-render path.
  release_date: string | null;
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

// pokemontcg.io goes through multi-minute windows of blanket 500s (its `/sets/<id>`
// route is the worst offender, but whole-API outages happen too). A linear
// 4×2.5s backoff rides out a blip, not an outage — and a full rebuild is a long
// enough run to hit one. Back off exponentially to ~80s and keep trying for
// ~4 minutes before giving up on a single request.
async function fetchJsonWithRetry(
  url: string,
  headers: Record<string, string> = {},
  tries = 7,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, Math.min(2500 * 2 ** attempt, 80_000)));
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
  const noWarm = process.argv.includes("--no-warm");

  const { createAdminClient } = await import("@/utils/supabase/admin");
  const { normalizeCardNumber } = await import("@/lib/search/cardNumber");
  const { deriveFinishes } = await import("@/lib/sets/setCardFinishes");
  const { fetchTcgdexSetCards, numberingAlignment, MIN_NUMBERING_ALIGNMENT } = await import("@/lib/sets/tcgdex");
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
      // Via the query endpoint, not `/sets/<id>` — the by-id route 500s
      // persistently for the newer sets (me3/me4/me5), while `q=id:` serves them
      // fine. Same payload, one extra layer of array.
      const json = (await fetchJsonWithRetry(
        `${PTCG_BASE}/sets?q=id:${encodeURIComponent(id)}&select=id,name,series,releaseDate,total,printedTotal`,
        headers,
      )) as { data?: PtcgSet[] };
      const found = json.data?.[0];
      if (found) sets.push(found);
      else console.warn(`  ${id}: pokemontcg.io has no such set — skipped`);
    }
  } else {
    const json = (await fetchJsonWithRetry(
      `${PTCG_BASE}/sets?pageSize=250&orderBy=-releaseDate&select=id,name,series,releaseDate,total,printedTotal`, headers,
    )) as { data?: PtcgSet[] };
    sets = json.data ?? [];
  }
  console.log(`sets to build: ${sets.length}`);

  let totalRows = 0;
  const builtSetCodes: string[] = []; // newest-first (sets are fetched -releaseDate)
  const failedSetCodes: string[] = [];

  for (const set of sets) {
   // One unreachable set must not discard the sets already built — a full run is
   // ~175 sets against an API that has outages, and an uncaught throw here used
   // to abandon the whole run. Skipped sets are named at the end so the operator
   // knows exactly what to re-run.
   try {
    const year = set.releaseDate ? Number(set.releaseDate.slice(0, 4)) : null;
    // pokemontcg.io ships YYYY/MM/DD; Postgres `date` wants YYYY-MM-DD.
    const releaseDate = set.releaseDate ? set.releaseDate.replace(/\//g, "-") : null;
    const rowsByNumber = new Map<string, SetCardRow>();
    // Numbers pokemontcg.io actually gave us printing keys for. If this stays
    // empty the whole set is dark and step 2b goes looking for a second opinion.
    const pricedNumbers = new Set<string>();

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
        if (priceKeys.length > 0) pricedNumbers.add(num);
        const { finishes, fidelity } = deriveFinishes({ priceKeys, rarityKey, setReleaseYear: year });
        rowsByNumber.set(num, {
          set_code: set.id,
          set_name: set.name,
          release_date: releaseDate,
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

    // ---- 2b. TCGdex backstop -------------------------------------------------
    // Two pokemontcg.io failures, both first seen in the ME era, both silent:
    //
    //   • No printings. It stopped populating `tcgplayer` for new expansions, so
    //     deriveFinishes fell back to one guessed finish per card and reverse
    //     holos vanished — Chaos Rising's master set read 122 instead of 198.
    //   • Missing cards. It declares a `total` it doesn't serve — me2pt5 says 295
    //     but lists 255, dropping the whole #250–295 secret-rare tail, which
    //     silently shortens the Complete Set denominator.
    //
    // Both are answered by the same one-pass read of TCGdex, so we only pay for
    // it when a set actually shows one of the symptoms. Neither gate fires for a
    // set pokemontcg.io is serving properly, which is what keeps a `--full`
    // rebuild from firing ~20k TCGdex requests.
    const darkPrintings = pricedNumbers.size === 0 && rowsByNumber.size > 0;
    // `total` counts every card including secrets; a set that legitimately has no
    // declared total can't be checked, so it isn't.
    const missingCards = !!set.total && rowsByNumber.size < set.total;
    if (darkPrintings || missingCards) {
      if (missingCards) {
        console.log(`  [${set.id}] pokemontcg.io served ${rowsByNumber.size} of its declared ${set.total} cards`);
      }
      try {
        const dexCards = await fetchTcgdexSetCards(set.name, {
          fetchJson: (url) => fetchJsonWithRetry(url),
          log: (m) => console.log(`  [${set.id}] ${m}`),
        });

        // Alignment gate: everything below matches on the collector number, so
        // refuse the whole source when the two catalogs number the set
        // differently (see numberingAlignment — Celebrations is the cautionary
        // tale). Applies to printings as well as card adds; a mismatched number
        // would attach the wrong card's printings just as wrongly.
        const ourNumbers = new Set(rowsByNumber.keys());
        const alignment = numberingAlignment(dexCards?.keys() ?? [], ourNumbers);
        const aligned = !!dexCards && alignment >= MIN_NUMBERING_ALIGNMENT;
        if (dexCards && !aligned) {
          console.warn(
            `  [${set.id}] TCGdex numbering doesn't line up ` +
              `(${Math.round(alignment * ourNumbers.size)}/${ourNumbers.size} of our numbers matched) — ignoring it`,
          );
        }

        let corrected = 0;
        let added = 0;
        for (const [num, dex] of aligned ? [...(dexCards?.entries() ?? [])] : []) {
          const row = rowsByNumber.get(num);

          if (!row) {
            if (!missingCards) continue; // not what we came for; don't widen the set
            // TCGdex-only card. No pokemon_api_id: inventing a `me2pt5-250` that
            // pokemontcg.io doesn't serve would poison the price cache key and
            // 400 the bedrock provider's `id:` query. It stays unpriced and
            // unlinked, but it counts — which is the whole point.
            const rarityKey = dex.rarity ? provider.mapRarity(dex.rarity) || null : null;
            const { finishes, fidelity } = deriveFinishes({
              priceKeys: dex.priceKeys, rarityKey, setReleaseYear: year,
            });
            rowsByNumber.set(num, {
              set_code: set.id,
              set_name: set.name,
              release_date: releaseDate,
              card_number: num,
              card_number_raw: dex.numberRaw,
              name: dex.name,
              rarity: rarityKey,
              image_url: dex.imageUrl,
              finishes,
              pokemon_api_id: null,
              tcgplayer_id: null,
              source: "tcgdex",
              variant_fidelity: fidelity,
            });
            added++;
            continue;
          }

          // Existing pokemontcg.io row: borrow printings only. An empty key set
          // means TCGdex has no pricing for the card, not that it has no
          // printings — overwriting with it would re-introduce the bug.
          if (!darkPrintings || dex.priceKeys.length === 0) continue;
          // `row.rarity` is already the mapped internal rarity key, which is what
          // deriveFinishes wants for the holo→textured/gold relabel.
          const { finishes, fidelity } = deriveFinishes({
            priceKeys: dex.priceKeys, rarityKey: row.rarity, setReleaseYear: year,
          });
          if (finishes.join() === row.finishes.join()) continue;
          row.finishes = finishes;
          row.variant_fidelity = fidelity;
          row.source = "pokemontcg+tcgdex";
          corrected++;
        }
        if (corrected > 0) console.log(`  [${set.id}] TCGdex corrected finishes on ${corrected} card(s)`);
        if (added > 0) console.log(`  [${set.id}] TCGdex added ${added} card(s) pokemontcg.io omitted`);
        if (missingCards && rowsByNumber.size < (set.total ?? 0)) {
          console.warn(`  [${set.id}] still short: ${rowsByNumber.size}/${set.total} after TCGdex`);
        }
        if (added > 0 && rowsByNumber.size > (set.total ?? Infinity)) {
          // The alignment gate should make this unreachable; if it fires, the two
          // catalogs disagree in a way it didn't catch. Say so loudly.
          console.warn(`  [${set.id}] OVER declared total: ${rowsByNumber.size}/${set.total} — check the checklist`);
        }
      } catch (e) {
        // Best-effort: a TCGdex outage leaves the pokemontcg.io-derived rows in
        // place (under-counted, but flagged `partial`); it never fails the build.
        console.warn(`  [${set.id}] TCGdex backstop skipped: ${(e as Error).message}`);
      }
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
        release_date: releaseDate,
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
      failedSetCodes.push(set.id);
    } else {
      totalRows += rows.length;
      builtSetCodes.push(set.id);
      console.log(`  ${set.id} (${set.name}): ${rows.length} cards (declared total ${set.total ?? "?"})`);
    }
   } catch (e) {
     console.error(`  ${set.id} (${set.name}) FAILED: ${(e as Error).message}`);
     failedSetCodes.push(set.id);
   }
  }

  console.log(`done: ${totalRows} set_cards rows across ${builtSetCodes.length}/${sets.length} sets`);
  if (failedSetCodes.length > 0) {
    console.warn(`failed (re-run with): pnpm sets:index --set ${failedSetCodes.join(",")}`);
  }

  // ---- 4. Price-warm the sets we just built (gap-only, budget-bounded) ------
  // Fills market values for cards with no cached price yet — chiefly brand-new
  // sets that live only in set_cards. Newest sets first; the JustTCG daily budget
  // caps the run, so a full rebuild never overspends (already-priced cards are a
  // no-op). Best-effort: a warming failure never fails the index build.
  if (!noWarm && builtSetCodes.length > 0) {
    const { warmSetPrices } = await import("@/lib/pricing/warmSetPrices");
    console.log(`warming prices for ${builtSetCodes.length} set(s) (gap-only, newest first)…`);
    let totalFresh = 0;
    // One set per call so each gets its own probe + budget check — a set that
    // can't be matched upstream aborts after a few requests instead of draining
    // the day's budget before the next set is reached.
    for (const code of builtSetCodes) {
      try {
        const r = await warmSetPrices(admin, [code], { onlyMissing: true, log: (m) => console.log(`  [${code}] ${m}`) });
        totalFresh += r.freshlyFetched;
        console.log(`  [${code}] ${r.aborted ? "skipped (unmatched upstream)" : `freshlyPriced=${r.freshlyFetched}${r.dropped ? ` deferred=${r.dropped}` : ""}`}`);
        // Budget spent: eligible cards remained but none could be processed.
        if (!r.aborted && r.processed === 0 && r.candidates > 0) {
          console.log(`  budget spent — stopping warm. Re-run 'pnpm sets:index' (or 'pnpm warm:set --set <code>') after the daily reset.`);
          break;
        }
      } catch (e) {
        console.warn(`  [${code}] warm skipped: ${(e as Error).message}`);
      }
    }
    console.log(`warm done: freshlyPriced=${totalFresh}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
