import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import { CardRef, FetchContext, PricePayload, PriceProvider, PriceProviderError } from "./PriceProvider";

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
    if (cards.length === 0) return result;

    await ctx.recordRequest();

    const q = cards.map((c) => `id:${c.apiId}`).join(" OR ");
    const params = new URLSearchParams({
      q,
      select: "id,tcgplayer",
      pageSize: String(cards.length),
    });

    const res = await fetch(`${API_BASE}/cards?${params}`, { headers: this.headers() });
    if (!res.ok) {
      if (res.status === 429 || res.status === 401 || res.status === 403) {
        throw new PriceProviderError(res.status, `pokemontcg.io ${res.status}`);
      }
      return result; // transient/other error: contribute nothing
    }

    const json: { data?: { id: string; tcgplayer?: TcgPlayerData | null }[] } = await res.json();
    for (const card of json.data ?? []) {
      if (!card.tcgplayer?.prices) continue;
      result.set(card.id, {
        prices: card.tcgplayer.prices,
        tcgplayerUrl: card.tcgplayer.url ?? null,
      });
    }
    return result;
  }
}
