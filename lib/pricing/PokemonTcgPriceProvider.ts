import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import { CardRef, FetchContext, PricePayload, PriceProvider } from "./PriceProvider";

const API_BASE = "https://api.pokemontcg.io/v2";

/**
 * Bedrock tier. pokemontcg.io serves TCGplayer snapshots (~24h stale) but is
 * effectively unlimited and always available, so it is the permanent fallback.
 * Looks cards up by their native id (the same `apiId` we store), avoiding any
 * ID-mapping problem. This is the batch logic that previously lived inline in
 * app/api/market-refresh/route.ts.
 */
export class PokemonTcgPriceProvider extends PriceProvider {
  readonly source = "pokemon_tcg" as const;
  readonly batchSize = 50;
  readonly dailyRequestCap = null;

  isConfigured(): boolean {
    return true; // works with or without POKEMON_TCG_API_KEY (key only raises limits)
  }

  private headers(): Record<string, string> {
    return process.env.POKEMON_TCG_API_KEY
      ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
      : {};
  }

  async fetchBatch(cards: CardRef[], ctx: FetchContext): Promise<Map<string, PricePayload>> {
    const result = new Map<string, PricePayload>();

    // pokemontcg.io is keyed by its native card id (e.g. "sv4-1"). JustTCG-sourced
    // (`tcg:<id>`) and hand-entered (`manual:<id>`) keys are NOT valid here, and
    // their colon is a Lucene field separator — so `id:tcg:123` is a syntax error
    // that 400s the WHOLE `OR` batch, starving every native card alongside it.
    // Look up only native ids; non-native ones simply have no bedrock price.
    const lookup = cards.filter((c) => !c.apiId.includes(":"));
    if (lookup.length === 0) return result;

    await ctx.recordRequest();

    const q = lookup.map((c) => `id:${c.apiId}`).join(" OR ");
    const params = new URLSearchParams({
      q,
      select: "id,tcgplayer",
      pageSize: String(lookup.length),
    });

    const res = await fetch(`${API_BASE}/cards?${params}`, { headers: this.headers() });
    if (!this.ensureOk(res, `batch of ${lookup.length}`)) return result;

    const json: { data?: { id: string; tcgplayer?: TcgPlayerData | null }[] } = await res.json();
    let withPrices = 0;
    for (const card of json.data ?? []) {
      if (!card.tcgplayer?.prices) continue;
      withPrices++;
      result.set(card.id, {
        prices: card.tcgplayer.prices,
        tcgplayerUrl: card.tcgplayer.url ?? null,
      });
    }
    if (process.env.PRICE_DEBUG) console.log(`[PRICE] pokemontcg.io status=200 asked=${lookup.length} returned=${(json.data ?? []).length} withPrices=${withPrices}`);
    return result;
  }
}
