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
    /** The reliable NNN/TTT collector number (null if none read) — logged
     *  separately from the noisy numberCandidates blob to measure read rate. */
    collectorNumber: string | null;
    /** Client bottom-strip targeted OCR reads, as received. */
    numberHints: string[];
    poolSize: number;
    justtcgAppended: number;
    top: ScanTopMatch[];
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

/**
 * Manual refine: the scanner identified the Pokémon but OCR couldn't read the
 * collector number (common on foils/promos), so the user types the number they
 * can see. pokemontcg.io native match leads (richer data, native id, plugs into
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
  const keyOf = (n: string, num: string) => `${baseName(n)}|${normalizeCardNumber(num)}`;

  if (clean.length >= 2) {
    // Native pokemontcg.io first, filtered to the exact number — the preferred copy.
    for (const c of await scanSearchPokemon([clean])) {
      if (normalizeCardNumber(c.number) !== want) continue;
      const k = keyOf(c.name, c.number);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        id: c.id, name: c.name, number: c.number, rarity: c.rarity,
        subtypes: c.subtypes, set: c.set, images: c.images, tcgplayer: c.tcgplayer ?? null,
      });
    }
    // JustTCG fills only the printings pokemontcg.io doesn't have.
    for (const c of await searchJustTcg(clean, number)) {
      const k = keyOf(c.name, c.number);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
      justtcgAppended++;
    }
  }
  return {
    candidates: out,
    confident: out.length === 1,
    debug: {
      nameCandidates: [clean], numberCandidates: [number],
      collectorNumber: null, numberHints: [],
      poolSize: out.length, justtcgAppended, top: [],
    },
  };
}

export async function matchScan(
  text: string,
  lines: string[],
  numberHints: string[] = [],
  nameHints: string[] = [],
): Promise<ScanMatch> {
  const useLines = lines.length ? lines : text.split("\n");
  // Targeted top-banner name reads lead the full-text candidates — they recover
  // stylized full-art names ("Empoleon") the full-card pass mangles ("leon").
  const nameCandidates = [
    ...new Set([...nameHints, ...(text.length >= 3 ? extractNameCandidates(text, useLines) : [])]),
  ];
  const attackPhrases = text.length >= 3 ? extractAttackPhrases(text, useLines) : [];
  // The reliable collector number (drives ranking + float); the broad list is only
  // for cheap JustTCG probing. numberHints (targeted bottom-strip OCR, client-side)
  // are the most reliable, so they lead; then the NNN/TTT collector number from the
  // full text; then broad standalone digits. Deduped, best-guess first.
  const collectorNumber = text.length >= 3 ? extractCollectorNumber(text, useLines) : null;
  const numberCandidates = [
    ...new Set(
      [...numberHints, collectorNumber, ...(text.length >= 3 ? extractNumbers(text, useLines) : [])].filter(Boolean),
    ),
  ] as string[];

  let top: ScanTopMatch[] = [];
  let out: SearchResult[] = [];
  let confident = false;
  let justtcgAppended = 0;
  let poolSize = 0;

  if (nameCandidates.length > 0 || attackPhrases.length > 0) {
    const pool = await scanSearchPokemon(nameCandidates, attackPhrases);
    poolSize = pool.length;
    const ranked = rankCandidates(pool, text, numberCandidates[0] ?? null, nameHints);
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
    let hitNumber: string | null = null;
    if (jtName) {
      const seen = new Set(out.map((c) => `${c.name.toLowerCase()}|${c.number}`));
      // Cap probes to conserve JustTCG quota now the scanner is GA. The targeted
      // number hint leads numberCandidates, so the right number is usually tried first.
      const tries: (string | undefined)[] = numberCandidates.length ? numberCandidates.slice(0, 2) : [undefined];
      for (const num of tries) {
        const jt = await searchJustTcg(jtName, num);
        let exactHit = false;
        for (const c of jt) {
          const k = `${c.name.toLowerCase()}|${c.number}`;
          if (!seen.has(k)) { seen.add(k); out.push(c); justtcgAppended++; }
          if (num && normalizeCardNumber(c.number) === normalizeCardNumber(num)) { exactHit = true; hitNumber = num; }
          if (out.length >= 14) break;
        }
        if (exactHit || out.length >= 14) break;
      }
    }

    // Float the exact printing to the top. Prefer the number that actually landed
    // an exact JustTCG hit; else the reliable collector number. (Not noisy broad
    // digits — those would float a wrong printing.)
    const floatNum = hitNumber ?? collectorNumber;
    if (floatNum) {
      const want = normalizeCardNumber(floatNum);
      out.sort((a, b) =>
        (normalizeCardNumber(b.number) === want ? 1 : 0) - (normalizeCardNumber(a.number) === want ? 1 : 0),
      );
    }
  }

  return {
    candidates: out,
    confident,
    debug: { nameCandidates, numberCandidates, collectorNumber, numberHints, poolSize, justtcgAppended, top },
  };
}
