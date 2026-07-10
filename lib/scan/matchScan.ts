import { scanSearchPokemon } from "@/lib/search/PokemonTCGProvider";
import type { SearchResult } from "@/lib/search/CardSearchProvider";
import { searchJustTcg } from "@/lib/search/justTcgSearch";
import { normalizeCardNumber } from "@/lib/search/cardNumber";

// Manual name+number lookup — the scanner's fallback tier for photos the
// perceptual-hash matcher (lib/scan/hashIndex) can't confidently place: the
// user types the card name and collector number they can see. (The OCR
// text-fingerprint pipeline that used to live here was retired in favor of
// image matching — see docs/card-scanning-research.md.)

export interface ScanMatch {
  candidates: SearchResult[];
  confident: boolean;
  debug: {
    matchedVia: "manual";
    name: string;
    number: string;
    justtcgAppended: number;
  };
}

// Base name for cross-provider dedup. The same physical printing arrives from
// pokemontcg.io and JustTCG with differently-spelled names ("Shuckle" vs
// "Shuckle - 136/132" vs "Shuckle (Cosmos Holo)"), so a raw name compare fails to
// collapse them. Strip JustTCG's " - <num>/<total>" / " - (variant)" suffix
// (hyphen with surrounding spaces only, so "Shuckle-GX"/"Ho-Oh" survive), drop
// parentheticals, and reduce to alphanumerics.
function baseName(n: string): string {
  return n.toLowerCase()
    .split(/\s+[-–—]\s+/)[0]
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Cross-provider dedup key: base name + normalized number. Collapses the same
 *  physical printing arriving from pokemontcg.io and JustTCG. */
function dedupKey(name: string, number: string): string {
  return `${baseName(name)}|${normalizeCardNumber(number)}`;
}

/**
 * Manual refine: the user types the card name + collector number they can see.
 * pokemontcg.io native match leads (richer data, native id, plugs into
 * pricing/rarity); JustTCG's number filter then fills only what pokemontcg.io
 * lacks (promos/new prints). Results are deduped across providers by base name +
 * normalized number so the same printing shows once (and can be confident).
 * Verified: ("Charmeleon","079") → the Cosmos Holo promo; ("Shuckle","136") →
 * me1-136 (single, confident).
 */
export async function manualLookup(name: string, number: string): Promise<ScanMatch> {
  const clean = name.trim();
  const want = normalizeCardNumber(number);
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  let justtcgAppended = 0;

  if (clean.length >= 2) {
    // Native pokemontcg.io first, filtered to the exact number — the preferred copy.
    for (const c of await scanSearchPokemon([clean])) {
      if (normalizeCardNumber(c.number) !== want) continue;
      const k = dedupKey(c.name, c.number);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        id: c.id, name: c.name, number: c.number, rarity: c.rarity,
        subtypes: c.subtypes, set: c.set, images: c.images, tcgplayer: c.tcgplayer ?? null,
      });
    }
    // JustTCG fills only the printings pokemontcg.io doesn't have.
    for (const c of await searchJustTcg(clean, number)) {
      const k = dedupKey(c.name, c.number);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
      justtcgAppended++;
    }
  }
  return {
    candidates: out,
    confident: out.length === 1,
    debug: { matchedVia: "manual", name: clean, number, justtcgAppended },
  };
}
