import { scanSearchPokemon, type ScanCandidate } from "@/lib/search/PokemonTCGProvider";
import type { SearchResult } from "@/lib/search/CardSearchProvider";
import { searchJustTcg } from "@/lib/search/justTcgSearch";
import { normalizeCardNumber } from "@/lib/search/cardNumber";
import {
  extractNameCandidates,
  extractAttackPhrases,
  extractNumbers,
  extractCollectorNumber,
  rankCandidates,
  resolveScan,
} from "@/lib/scan/fingerprint";

// The whole scan-matching pipeline as one pure(ish) function: OCR text in →
// ranked candidate printings out. Extracted from the API route so it can be
// replayed against real logged OCR text locally (scripts/scan-replay.ts) —
// no deploy needed to test matching changes.

export interface ScanTopMatch { name: string; set: string; number: string; score: number }

export interface ScanMatch {
  candidates: SearchResult[];
  confident: boolean;
  debug: {
    nameCandidates: string[];
    numberCandidates: string[];
    poolSize: number;
    justtcgAppended: number;
    top: ScanTopMatch[];
  };
}

/**
 * Manual refine: the scanner identified the Pokémon but OCR couldn't read the
 * collector number (common on foils/promos), so the user types the number they
 * can see. JustTCG's number filter pulls the exact printing (promos/new cards
 * name-only search misses); pokemontcg.io fills in any native match. Verified:
 * ("Charmeleon","079") → the Cosmos Holo promo; ("Crobat","093") → ME04 093/086.
 */
export async function manualLookup(name: string, number: string): Promise<ScanMatch> {
  const clean = name.trim();
  const want = normalizeCardNumber(number);
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  let justtcgAppended = 0;

  if (clean.length >= 2) {
    for (const c of await searchJustTcg(clean, number)) {
      const k = `${c.name.toLowerCase()}|${c.number}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
      justtcgAppended++;
    }
    for (const c of await scanSearchPokemon([clean])) {
      if (normalizeCardNumber(c.number) !== want) continue;
      const k = `${c.name.toLowerCase()}|${c.number}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        id: c.id, name: c.name, number: c.number, rarity: c.rarity,
        subtypes: c.subtypes, set: c.set, images: c.images, tcgplayer: c.tcgplayer ?? null,
      });
    }
  }
  return {
    candidates: out,
    confident: out.length === 1,
    debug: { nameCandidates: [clean], numberCandidates: [number], poolSize: out.length, justtcgAppended, top: [] },
  };
}

export async function matchScan(text: string, lines: string[]): Promise<ScanMatch> {
  const useLines = lines.length ? lines : text.split("\n");
  const nameCandidates = text.length >= 3 ? extractNameCandidates(text, useLines) : [];
  const attackPhrases = text.length >= 3 ? extractAttackPhrases(text, useLines) : [];
  // The reliable collector number (drives ranking + float); the broad list is only
  // for cheap JustTCG probing. Put the reliable one first so it's tried first.
  const collectorNumber = text.length >= 3 ? extractCollectorNumber(text, useLines) : null;
  const numberCandidates = [
    ...new Set([collectorNumber, ...(text.length >= 3 ? extractNumbers(text, useLines) : [])].filter(Boolean)),
  ] as string[];

  let top: ScanTopMatch[] = [];
  let out: SearchResult[] = [];
  let confident = false;
  let justtcgAppended = 0;
  let poolSize = 0;

  if (nameCandidates.length > 0 || attackPhrases.length > 0) {
    const pool = await scanSearchPokemon(nameCandidates, attackPhrases);
    poolSize = pool.length;
    const ranked = rankCandidates(pool, text, collectorNumber);
    top = ranked.slice(0, 6).map((r) => ({
      name: r.card.name, set: r.card.set?.name ?? "", number: r.card.number, score: r.score,
    }));
    const resolved = resolveScan(ranked, 8);
    confident = resolved.confident;
    out = resolved.candidates.map((c: ScanCandidate) => ({
      id: c.id, name: c.name, number: c.number, rarity: c.rarity,
      subtypes: c.subtypes, set: c.set, images: c.images, tcgplayer: c.tcgplayer ?? null,
    }));

    // Probe JustTCG with the clean matched name + each candidate number; foils
    // rarely give a clean name AND number in one scan, so try a few numbers and
    // stop as soon as one lands exactly. Surfaces promos/new prints name-only misses.
    // Prefer the clean matched name; if nothing matched, fall back to the LONGEST
    // OCR name candidate (a real name like "crobat" beats junk like "ale").
    const jtName = out[0]?.name ?? [...nameCandidates].sort((a, b) => b.length - a.length)[0];
    if (jtName) {
      const seen = new Set(out.map((c) => `${c.name.toLowerCase()}|${c.number}`));
      const tries: (string | undefined)[] = numberCandidates.length ? numberCandidates.slice(0, 3) : [undefined];
      for (const num of tries) {
        const jt = await searchJustTcg(jtName, num);
        let exactHit = false;
        for (const c of jt) {
          const k = `${c.name.toLowerCase()}|${c.number}`;
          if (!seen.has(k)) { seen.add(k); out.push(c); justtcgAppended++; }
          if (num && normalizeCardNumber(c.number) === normalizeCardNumber(num)) exactHit = true;
          if (out.length >= 14) break;
        }
        if (exactHit || out.length >= 14) break;
      }
    }

    // Float the card matching the RELIABLE collector number to the top — the exact
    // printing. Only the collector number (not noisy standalone digits) drives this.
    if (collectorNumber) {
      const want = normalizeCardNumber(collectorNumber);
      out.sort((a, b) =>
        (normalizeCardNumber(b.number) === want ? 1 : 0) - (normalizeCardNumber(a.number) === want ? 1 : 0),
      );
    }
  }

  return {
    candidates: out,
    confident,
    debug: { nameCandidates, numberCandidates, poolSize, justtcgAppended, top },
  };
}
