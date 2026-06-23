import { CardRef, FetchContext, PricePayload, PriceProvider } from "./PriceProvider";
import { variantsToPrices, variantsToConditionPrices, type JustTcgVariant } from "./justtcgVariants";
import { normalizeCardNumber as normNumber } from "@/lib/search/cardNumber";

const API_BASE = "https://api.justtcg.com/v1";
// JustTCG game identifier for Pokémon. Verify against /docs if lookups 404.
const GAME = "pokemon";

// Loose text key for name/set comparison: alphanumerics only, casefolded.
function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
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
  readonly batchSize = 20;
  readonly dailyRequestCap = 100;

  isConfigured(): boolean {
    return !!process.env.JUSTTCG_API_KEY;
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": process.env.JUSTTCG_API_KEY ?? "",
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
      });
    }
  }

  /** GET /cards to find an unmapped card by name/number — resolves id + price. */
  private async resolveAndPrice(
    card: CardRef,
    out: Map<string, PricePayload>,
  ): Promise<void> {
    if (!card.name) return;

    const params = new URLSearchParams({ game: GAME, q: card.name });
    const res = await fetch(`${API_BASE}/cards?${params}`, { headers: this.headers() });
    if (!this.ensureOk(res, `resolve ${card.name ?? "?"}`)) return;

    const candidates = await this.parseCards(res);
    const match = this.bestMatch(candidates, card);
    if (!match?.tcgplayerId) return;

    out.set(card.apiId, {
      prices: variantsToPrices(match.variants),
      conditionPrices: variantsToConditionPrices(match.variants),
      tcgplayerId: match.tcgplayerId,
    });
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

    // Drop unrelated hits from the fuzzy name search (q=name can return cousins).
    if (card.name) {
      const wantName = normText(card.name);
      const byName = pool.filter(
        (c) => c.name && (normText(c.name).includes(wantName) || wantName.includes(normText(c.name))),
      );
      if (byName.length > 0) pool = byName;
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
