// Text-fingerprint card identification (server-safe, no DOM).
//
// The scanner OCRs a card's high-contrast BODY text (name, attack names, HP) and
// matches it against the card DB — far more reliable than reading the tiny print
// number. This module holds the pure extraction + ranking logic; the pokemontcg.io
// queries live in lib/search, the OCR in lib/scan/ocr (client). See
// docs/card-scanning-research.md §4 for the measurements behind this approach.

import { normalizeCardNumber } from "@/lib/search/cardNumber";

// ---------- fuzzy helpers (tolerate OCR character errors) ----------
export function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
export function tokens(s: string): string[] {
  return norm(s).split(" ").filter((t) => t.length >= 2);
}
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
export function sim(a: string, b: string): number {
  const L = Math.max(a.length, b.length);
  return L === 0 ? 1 : 1 - lev(a, b) / L;
}
/** Is `token` present (fuzzily) among a bag of OCR tokens? */
export function tokenPresent(hayTokens: string[], token: string, thresh = 0.8): boolean {
  return hayTokens.some((h) => sim(h, token) >= thresh);
}
/** Are all of a phrase's content tokens present in the OCR token bag? */
export function phrasePresent(hayTokens: string[], phrase: string, thresh = 0.8): boolean {
  const pt = tokens(phrase);
  if (!pt.length) return false;
  return pt.every((t) => tokenPresent(hayTokens, t, thresh));
}

// ---------- name extraction ----------
// Card boilerplate that is never the Pokémon's name — filtered from candidates so
// e.g. "Evolves from Charmander" can't make us query Charmander.
const STOPWORDS = new Set([
  "pokemon", "stage", "basic", "evolves", "evolve", "from", "weakness", "resistance",
  "retreat", "trainer", "energy", "illus", "the", "and", "this", "your", "you", "when",
  "put", "into", "play", "card", "cards", "turn", "damage", "each", "may", "for", "with",
  "ability", "attack", "poke", "body", "power", "rule", "level", "team", "item", "supporter",
  "gym", "special", "basic", "then", "search", "deck", "hand", "flip", "coin", "active",
]);

// A real Pokémon name is a single token of at most ~13 chars. Longer "tokens" are
// OCR run-on garbage (merged words with lost spaces) — capping length keeps them
// from crowding out the actual name in the candidate list.
const MAX_NAME_LEN = 13;

// Anchor: across every era the Pokémon name shares a top-band line with the HP
// ("Blastoise 100 HP", "Pikachu 40 HP", "Mew … 180"). Pull the alpha tokens off
// those lines; fall back to the longest tokens anywhere. OCR reads top-to-bottom,
// so the first ~45% of lines is the "top band". Evolution lines ("Evolves from X")
// and boilerplate are excluded — they name a *different* Pokémon.
export function extractNameCandidates(text: string, lines: string[]): string[] {
  const excluded = new Set<string>();
  lines.forEach((line) => {
    if (/evolv/i.test(line)) tokens(line).forEach((t) => excluded.add(t));
  });
  const usable = (t: string) =>
    t.length >= 3 && t.length <= MAX_NAME_LEN && !STOPWORDS.has(t) && !excluded.has(t);

  const out: string[] = [];
  const topCount = Math.max(3, Math.ceil(lines.length * 0.45));
  lines.slice(0, topCount).forEach((line) => {
    if (/evolv/i.test(line)) return;
    const hasHp = /\bhp\b/i.test(line);
    const num = /\b(\d{2,3})\b/.exec(line)?.[1];
    const lineTokens = tokens(line.replace(/\bhp\b/gi, " ").replace(/\d+/g, " ")).filter(usable);
    if (hasHp || (num && +num >= 20 && +num <= 340)) {
      // HP-anchored line — the name sits here (best signal).
      lineTokens.forEach((t) => out.push(t));
    } else if (lineTokens.length >= 1 && lineTokens.length <= 3) {
      // A short top-band line with no HP read — likely the title (name) on a foil
      // where the HP didn't OCR. Take its longest token as a name candidate.
      out.push([...lineTokens].sort((a, b) => b.length - a.length)[0]);
    }
  });
  const longest = [...new Set(tokens(text).filter((t) => t.length >= 5 && usable(t)))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
  return [...new Set([...out, ...longest])].slice(0, 8);
}

// Attack-name candidates. When the Pokémon name OCRs badly (stylized foil), the
// attack text often still reads — so we also retrieve by attack name. Pull
// multi-word phrases (adjacent alpha words) and distinctive long single words from
// the body (below the top band), skipping boilerplate.
export function extractAttackPhrases(text: string, lines: string[]): string[] {
  const topCount = Math.max(3, Math.ceil(lines.length * 0.45));
  const body = lines.slice(topCount);
  const phrases: string[] = [];
  const singles: string[] = [];

  body.forEach((line) => {
    if (/evolv/i.test(line)) return;
    const words = tokens(line).filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].length <= MAX_NAME_LEN && words[i + 1].length <= MAX_NAME_LEN) {
        phrases.push(`${words[i]} ${words[i + 1]}`);
      }
    }
    words.forEach((w) => { if (w.length >= 7 && w.length <= MAX_NAME_LEN) singles.push(w); });
  });

  return [...new Set([...phrases, ...singles])].slice(0, 6);
}

// Collector number from OCR, when the "NNN/TTT" form reads (e.g. "093/086" → "093").
// Post-crop this often reads even on modern cards, and it's the key to the *exact
// printing*: it boosts ranking and lets JustTCG surface promos/new cards by number.
// Conservative — only the slash form, to avoid inventing a wrong number.
export function extractNumber(text: string): string | null {
  const slash = text.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  if (slash) return slash[1];
  // OCR frequently mangles the "/" — reading "093/086" as "0937086" (slash→7) or
  // dropping it ("093086"). Recover NNN/TTT from those merged runs. Gated
  // downstream (only trusted alongside a name/attack match), so a false read is cheap.
  const merged = text.match(/\b(\d{2,3})7(\d{2,3})\b/) || text.match(/\b(\d{3})(\d{3})\b/);
  return merged ? merged[1] : null;
}

// ---------- ranking ----------
export interface RankableCard {
  id: string;
  name: string;
  number?: string;
  attacks?: { name: string }[];
  hp?: string;
}

export interface RankedCard<T extends RankableCard> {
  card: T;
  score: number;
  /** Cards sharing this identity (same name+attacks) are indistinguishable by text. */
  identityKey: string;
}

function identityKey(c: RankableCard): string {
  const atk = (c.attacks || []).map((a) => norm(a.name)).sort().join("|");
  return `${norm(c.name)}#${atk}`;
}

/**
 * Rank candidates by how much of the DISCRIMINATIVE fingerprint appears in the OCR:
 * attack names + HP dominate (the Pokémon name is shared by every reprint, so it
 * barely moves the score). Returns cards sorted best-first, each tagged with its
 * identity key so callers can collapse the reprint tie-set.
 */
export function rankCandidates<T extends RankableCard>(
  candidates: T[],
  ocrText: string,
  wantNumber?: string | null,
): RankedCard<T>[] {
  const hay = tokens(ocrText);
  const want = wantNumber ? normalizeCardNumber(wantNumber) : null;
  return candidates
    .map((card) => {
      const atkHit = (card.attacks || []).filter((a) => phrasePresent(hay, a.name)).length;
      const hpHit = card.hp && tokenPresent(hay, String(card.hp), 0.9) ? 1 : 0;
      const nameHit = phrasePresent(hay, card.name) ? 1 : 0;
      // A collector-number match is only trusted when the card also matches by name
      // or attack — otherwise a coincidental number would surface a wrong card. When
      // it does line up, it's the strongest signal for the *exact printing*.
      const idMatch = nameHit === 1 || atkHit > 0;
      const numHit = want && idMatch && card.number && normalizeCardNumber(card.number) === want ? 1 : 0;
      const score = atkHit * 10 + hpHit * 4 + nameHit + numHit * 20;
      return { card, score, identityKey: identityKey(card) };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Turn ranked candidates into a user-facing shortlist. Confidence-gated
 * ("confident-or-nothing"): if the top identity is a clear winner we mark it
 * confident, but we still surface the tie-set of same-identity reprints for the
 * user to confirm the exact printing (text can't separate reprints — see research
 * doc §4). Cross-identity runners-up are appended so a mis-rank is still fixable.
 */
export function resolveScan<T extends RankableCard>(ranked: RankedCard<T>[], limit = 8): {
  candidates: T[];
  confident: boolean;
} {
  // Only keep cards that actually matched fingerprint signal (attack/HP/name).
  // A score of 0 means a name-prefix query pulled in an unrelated card (e.g. a
  // garbled "arm" candidate matching every Armaldo) — that's noise, not a match,
  // and returning it just buries the real card. Callers still append JustTCG
  // fuzzy-name results separately for cards pokemontcg.io can't fingerprint.
  const scored = ranked.filter((r) => r.score > 0);
  if (scored.length === 0) return { candidates: [], confident: false };
  const top = scored[0];
  const topIdentity = scored.filter((r) => r.identityKey === top.identityKey);
  const others = scored.filter((r) => r.identityKey !== top.identityKey);
  const runnerUp = others[0];
  // Confident when the top card beats the best different-identity candidate clearly.
  const confident = !runnerUp || top.score >= runnerUp.score + 10;
  const ordered = [...topIdentity, ...others].slice(0, limit).map((r) => r.card);
  return { candidates: ordered, confident };
}
