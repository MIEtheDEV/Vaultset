import "server-only";

// Shared, hourly-cached pokemontcg.io set catalog (one call for ~all sets),
// used to enrich /sets hubs with logo/series/release/printed-total without a
// per-request upstream fetch. Matches `cards.set_code` === pokemontcg `set.id`.

export interface PokemonSet {
  id: string;
  name: string;
  series?: string;
  releaseDate?: string;
  total?: number;
  printedTotal?: number;
  images?: { symbol?: string; logo?: string };
}

export async function getPokemonSets(): Promise<Map<string, PokemonSet>> {
  const headers: Record<string, string> = {};
  if (process.env.POKEMON_TCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
  const params = new URLSearchParams({
    pageSize: "250",
    select: "id,name,series,releaseDate,total,printedTotal,images",
    orderBy: "-releaseDate",
  });
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/sets?${params}`, {
      headers,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return new Map();
    const json = await res.json();
    const sets: PokemonSet[] = json?.data ?? [];
    return new Map(sets.map((s) => [s.id, s]));
  } catch {
    return new Map();
  }
}
