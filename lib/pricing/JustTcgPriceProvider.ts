import { CardRef, FetchContext, PricePayload, PriceProvider } from "./PriceProvider";
import { variantsToPrices, variantsToConditionPrices, type JustTcgVariant } from "./justtcgVariants";
import { justTcgLimits } from "./justtcgTier";
import { normalizeCardNumber as normNumber } from "@/lib/search/cardNumber";

const API_BASE = "https://api.justtcg.com/v1";
// JustTCG game identifier for Pokémon. Verify against /docs if lookups 404.
const GAME = "pokemon";

// Loose text key for name/set comparison: alphanumerics only, casefolded.
function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// JustTCG set list (name → set id), memoized for the process. The /cards `set`
// filter needs JustTCG's own set id (e.g. "me03-perfect-order-pokemon"), not the
// human name, so we fetch the set catalogue once and map our set_name to it. Set
// data is stable, so a single fetch per cold start is plenty (and negligible vs
// the per-card daily budget). Failures cache an empty map — resolveAndPrice then
// falls back to the name search.
// Per-minute pacing shared across every JustTCG call in the process (a sliding
// 60s window). Keeps bulk jobs (catalog warm) under the plan's per-minute wall so
// they don't trip a 429 — which would back the provider off for the whole day and
// waste the remaining budget. On-demand calls (a card or two) never wait.
let callWindow: number[] = [];
async function paceJustTcg(perMinute: number): Promise<void> {
  for (;;) {
    const now = Date.now();
    callWindow = callWindow.filter((t) => now - t < 60_000);
    if (callWindow.length < perMinute) { callWindow.push(now); return; }
    await new Promise((r) => setTimeout(r, 60_000 - (now - callWindow[0]) + 25));
  }
}

let setMapPromise: Promise<Map<string, string>> | null = null;
async function loadSetMap(headers: Record<string, string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(`${API_BASE}/sets?game=${GAME}`, { headers });
    if (!res.ok) return map;
    const json = await res.json();
    const arr = (Array.isArray(json) ? json : (json?.data ?? [])) as { id?: string; name?: string }[];
    for (const s of arr) if (s.id && s.name) map.set(normText(s.name), s.id);
  } catch {
    /* fall back to name search */
  }
  return map;
}

interface JustTcgCard {
  tcgplayerId?: string;
  name?: string;
  number?: string;
  set_name?: string;
  variants?: JustTcgVariant[];
}

/**
 * Tier 1 — JustTCG (refreshes ~every 6h, free tier 100 requests/day, batch of 20
 * per POST). JustTCG keys cards by `tcgplayerId` / its own `cardId`, NEITHER of
 * which we store, so:
 *   - Cards with a cached tcgplayer_id are priced via the efficient POST batch.
 *   - Cards without one are skipped here (they cascade to bedrock) UNLESS
 *     ctx.allowResolve is set (the single-card on-demand path), in which case we
 *     spend one GET /cards lookup to resolve the tcgplayerId AND fetch the price
 *     in the same call, persisting the id for future batches.
 */
export class JustTcgPriceProvider extends PriceProvider {
  readonly source = "justtcg" as const;
  readonly batchSize: number;
  readonly dailyRequestCap: number | null;
  readonly monthlyRequestCap: number | null;
  private readonly perMinute: number;

  constructor() {
    super();
    // Limits scale with the subscribed plan (free vs paid Starter/Pro/Enterprise).
    const limits = justTcgLimits();
    this.batchSize = limits.batchSize;
    this.dailyRequestCap = limits.dailyCap;
    this.monthlyRequestCap = limits.monthlyCap;
    this.perMinute = limits.perMinute;
  }

  /** Prefer the paid key (higher daily/monthly/per-minute limits) when present. */
  private apiKey(): string | undefined {
    return process.env.JUSTTCG_API_KEY_PAID || process.env.JUSTTCG_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey();
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey() ?? "",
      "Content-Type": "application/json",
    };
  }

  async fetchBatch(cards: CardRef[], ctx: FetchContext): Promise<Map<string, PricePayload>> {
    const result = new Map<string, PricePayload>();

    const mapped = cards.filter((c) => c.tcgplayerId);
    const unmapped = cards.filter((c) => !c.tcgplayerId);

    // One batch POST covers all mapped cards (≤ batchSize). Skip if over budget.
    if (mapped.length > 0 && (await ctx.recordRequest())) {
      await this.batchByTcgplayerId(mapped, result);
    }

    // Resolve unmapped cards one GET at a time until the daily budget runs out;
    // whatever resolved before that point is kept (partial results), rather than
    // discarding the chunk. Real API rate-limits still throw via ensureOk.
    if (ctx.allowResolve) {
      for (const card of unmapped) {
        if (!(await ctx.recordRequest())) break;
        await this.resolveAndPrice(card, result);
      }
    }

    return result;
  }

  /** POST /cards with up to 20 items keyed by tcgplayerId (one request). */
  private async batchByTcgplayerId(
    cards: CardRef[],
    out: Map<string, PricePayload>,
  ): Promise<void> {
    const byTcgId = new Map(cards.map((c) => [c.tcgplayerId!, c]));
    await paceJustTcg(this.perMinute);
    const res = await fetch(`${API_BASE}/cards`, {
      method: "POST",
      headers: this.headers(),
      // JustTCG's batch endpoint expects a BARE ARRAY of lookup objects, not a
      // { items: [...] } envelope — the latter returns 400 INVALID_REQUEST.
      body: JSON.stringify(cards.map((c) => ({ tcgplayerId: c.tcgplayerId }))),
    });
    if (!this.ensureOk(res, `batch of ${cards.length}`)) return;

    for (const jcard of await this.parseCards(res)) {
      const ref = jcard.tcgplayerId ? byTcgId.get(jcard.tcgplayerId) : undefined;
      if (!ref) continue;
      out.set(ref.apiId, {
        prices: variantsToPrices(jcard.variants),
        conditionPrices: variantsToConditionPrices(jcard.variants),
        tcgplayerId: jcard.tcgplayerId ?? ref.tcgplayerId ?? null,
        raw: jcard, // full card incl. every variant's analytics — archived verbatim
      });
    }
  }

  /**
   * GET /cards to find an unmapped card — resolves id + price. Two strategies:
   *   1. Precise: `set=<justtcgSetId>&number=<n>` returns the single exact card,
   *      even for common names (Gengar, Ho-Oh) whose printings run to dozens of
   *      pages — a plain `q=name` search only sees the first page and buries the
   *      one we want.
   *   2. Fallback: `q=name` fuzzy search, for cards whose set we can't map
   *      (older sets, promos) — still gated by the number-anchored bestMatch.
   */
  private async resolveAndPrice(
    card: CardRef,
    out: Map<string, PricePayload>,
  ): Promise<void> {
    if (!card.name && !card.number) return;

    // 1. Precise set + number lookup (one unambiguous hit).
    let match: JustTcgCard | undefined;
    const sid = card.number ? await this.setId(card.setName) : undefined;
    if (sid && card.number) {
      const params = new URLSearchParams({ game: GAME, set: sid, number: normNumber(card.number) });
      await paceJustTcg(this.perMinute);
      const res = await fetch(`${API_BASE}/cards?${params}`, { headers: this.headers() });
      if (!this.ensureOk(res, `resolve ${card.name ?? "?"} by set`)) return;
      match = this.bestMatch(await this.parseCards(res), card);
    }

    // 2. Fallback fuzzy name search when the set path didn't confidently match
    //    (set unmapped, or its candidates were ambiguous/wrong).
    if (!match && card.name) {
      const params = new URLSearchParams({ game: GAME, q: card.name });
      await paceJustTcg(this.perMinute);
      const res = await fetch(`${API_BASE}/cards?${params}`, { headers: this.headers() });
      if (!this.ensureOk(res, `resolve ${card.name ?? "?"}`)) return;
      match = this.bestMatch(await this.parseCards(res), card);
    }

    if (!match?.tcgplayerId) return;

    out.set(card.apiId, {
      prices: variantsToPrices(match.variants),
      conditionPrices: variantsToConditionPrices(match.variants),
      tcgplayerId: match.tcgplayerId,
      raw: match, // full card incl. every variant's analytics — archived verbatim
    });
  }

  /** Map our set name to JustTCG's set id (needed by the /cards `set` filter). */
  private async setId(setName?: string): Promise<string | undefined> {
    if (!setName) return undefined;
    if (!setMapPromise) setMapPromise = loadSetMap(this.headers());
    const map = await setMapPromise;
    const want = normText(setName);
    if (!want) return undefined;
    if (map.has(want)) return map.get(want);
    // JustTCG prefixes set names ("ME03: Perfect Order"), so match by inclusion.
    for (const [name, id] of map) {
      if (name.includes(want) || want.includes(name)) return id;
    }
    return undefined;
  }

  /**
   * Identify a JustTCG card for one of ours — **confidently or not at all**.
   * The collector number is the anchor (two different cards in the same set never
   * share a number), so we require a number match and refuse to guess when the
   * result is ambiguous. Returning undefined lets the engine fall back to bedrock
   * (which prices by exact pokemon_api_id) instead of attaching a wrong price.
   */
  private bestMatch(candidates: JustTcgCard[], card: CardRef): JustTcgCard | undefined {
    // Without our own collector number we can't be sure which card this is.
    if (!card.number) return undefined;

    const wantNumber = normNumber(card.number);
    let pool = candidates.filter(
      (c) => c.tcgplayerId && c.number && normNumber(c.number) === wantNumber,
    );
    if (pool.length === 0) return undefined;

    // Narrow by name. Prefer an EXACT (normalized) name match: the big ME sets
    // put several cards on one number — "Rayquaza", "Rayquaza (Friend Ball)",
    // "Rayquaza (Energy Symbol Pattern)" all at #153 — and our inventory stores
    // the plain base name, so the exact match uniquely picks the base card. Fall
    // back to loose containment for cross-source naming drift (q=name cousins).
    if (card.name) {
      const wantName = normText(card.name);
      const exact = pool.filter((c) => c.name && normText(c.name) === wantName);
      if (exact.length === 1) return exact[0];
      if (exact.length > 1) pool = exact;
      else {
        const byName = pool.filter(
          (c) => c.name && (normText(c.name).includes(wantName) || wantName.includes(normText(c.name))),
        );
        if (byName.length === 1) return byName[0];
        if (byName.length > 1) {
          // Same number + set, several name-containing hits: pattern/ball variants
          // that adorn the base name with suffixes ("(Friend Ball)", or an embedded
          // "- 170/217 (Poke Ball)" when JustTCG has no bare-name row). Our inventory
          // holds the base card, whose name is strictly the shortest — take it when
          // it's unambiguously shorter than the next; otherwise stay ambiguous.
          const sorted = [...byName].sort((a, b) => normText(a.name!).length - normText(b.name!).length);
          if (normText(sorted[0].name!).length < normText(sorted[1].name!).length) return sorted[0];
          pool = byName;
        }
      }
    }

    if (pool.length === 1) return pool[0];

    // Same number across multiple sets → the set must disambiguate, else give up.
    if (card.setName) {
      const wantSet = normText(card.setName);
      const bySet = pool.filter(
        (c) => c.set_name && (normText(c.set_name) === wantSet
          || normText(c.set_name).includes(wantSet) || wantSet.includes(normText(c.set_name))),
      );
      if (bySet.length === 1) return bySet[0];
    }

    return undefined; // ambiguous — don't guess
  }

  private async parseCards(res: Response): Promise<JustTcgCard[]> {
    const json = await res.json();
    if (Array.isArray(json)) return json as JustTcgCard[];
    return (json?.data ?? []) as JustTcgCard[];
  }

}
