import { CardRef, FetchContext, PricePayload, PriceProvider } from "./PriceProvider";

/**
 * Tier 3 — PokéWallet high-volume safety buffer (1,000 requests/month, metered
 * hourly). SCAFFOLD ONLY: inert until POKEWALLET_API_KEY is set. See
 * TcgGoPriceProvider for the same staged-rollout rationale.
 */
export class PokeWalletPriceProvider extends PriceProvider {
  readonly source = "pokewallet" as const;
  readonly batchSize = 1;
  readonly dailyRequestCap = 100;

  isConfigured(): boolean {
    return !!process.env.POKEWALLET_API_KEY;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchBatch(_cards: CardRef[], _ctx: FetchContext): Promise<Map<string, PricePayload>> {
    return new Map();
  }
}
