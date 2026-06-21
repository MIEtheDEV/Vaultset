import { CardRef, FetchContext, PricePayload, PriceProvider } from "./PriceProvider";

/**
 * Tier 2 — TCGGO via RapidAPI (single-card real-time lookups, graded + EU data).
 * SCAFFOLD ONLY: inert until TCGGO_RAPID_API_KEY is set. fetchBatch is implemented
 * once the key exists and the ID-mapping approach (see JustTcgPriceProvider) is
 * confirmed for this source. Until then isConfigured() is false and the factory
 * skips it.
 */
export class TcgGoPriceProvider extends PriceProvider {
  readonly source = "tcggo" as const;
  readonly batchSize = 1;
  readonly dailyRequestCap = 100;

  isConfigured(): boolean {
    return !!process.env.TCGGO_RAPID_API_KEY;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchBatch(_cards: CardRef[], _ctx: FetchContext): Promise<Map<string, PricePayload>> {
    return new Map();
  }
}
