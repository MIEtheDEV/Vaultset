/**
 * The single "headline" market value for a card — the number shown on grids and
 * used to rank chase cards. Picks the first finish that carries a market price,
 * preferring the finish a collector is most likely to mean.
 *
 * NOT a replacement for PokemonTCGProvider.getMarketPrice(), which resolves a
 * *specific* copy (finish + edition + condition + grade) for valuing inventory.
 * This is the set-level "what's this card worth" figure.
 */
export function headlineMarketValue(prices: unknown): number | null {
  if (!prices || typeof prices !== "object") return null;
  const p = prices as Record<string, { market?: number | null } | null>;
  return (
    p.holofoil?.market ??
    p.normal?.market ??
    p.reverseHolofoil?.market ??
    Object.values(p).map((x) => x?.market).find((m) => m != null) ??
    null
  );
}
