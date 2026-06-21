import type { SearchResult } from "./CardSearchProvider";
import { variantsToPrices, type JustTcgVariant } from "@/lib/pricing/justtcgVariants";

const API_BASE = "https://api.justtcg.com/v1";

interface JustTcgCard {
  tcgplayerId?: string;
  name?: string;
  number?: string;
  set_name?: string;
  rarity?: string;
  variants?: JustTcgVariant[];
}

// TCGplayer's public image CDN, keyed by product id (verified to resolve).
function tcgImage(id: string, size: "small" | "large"): string {
  const suffix = size === "small" ? "_200w.jpg" : "_in_1000x1000.jpg";
  return `https://tcgplayer-cdn.tcgplayer.com/product/${id}${suffix}`;
}

/**
 * Secondary catalog source for cards pokemontcg.io is missing (many promos and
 * brand-new sets). Returns SearchResult rows whose id is prefixed `tcg:` so the
 * add flow knows to store a tcgplayer_id (not a pokemon_api_id). Images come
 * from TCGplayer's CDN and prices from the card's variants, so getMarketPrice()
 * works at add-time. No-ops (returns []) when JUSTTCG_API_KEY is unset.
 */
export async function searchJustTcg(query: string, number?: string): Promise<SearchResult[]> {
  const key = process.env.JUSTTCG_API_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({ game: "pokemon", q: query });
    // JustTCG's name search returns only its top ~20 by relevance (pagination is
    // ignored), so obscure promos are unreachable by name alone. The number
    // filter narrows server-side and surfaces the exact card (e.g. ETB promos).
    if (number) params.set("number", number);
    const res = await fetch(`${API_BASE}/cards?${params}`, {
      headers: { "x-api-key": key },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const cards: JustTcgCard[] = Array.isArray(json) ? json : (json?.data ?? []);

    return cards
      .filter((c) => c.tcgplayerId && c.name)
      .map((c) => ({
        id:     `tcg:${c.tcgplayerId}`,
        name:   c.name!,
        number: (c.number ?? "").split("/")[0],
        rarity: c.rarity,
        set:    { id: "", name: c.set_name ?? "" },
        images: { small: tcgImage(c.tcgplayerId!, "small"), large: tcgImage(c.tcgplayerId!, "large") },
        tcgplayer: {
          url: `https://www.tcgplayer.com/product/${c.tcgplayerId}`,
          updatedAt: new Date().toISOString(),
          prices: variantsToPrices(c.variants),
        },
      }));
  } catch {
    return [];
  }
}
