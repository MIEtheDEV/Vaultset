// Derive a card's pricing-cache key from its game_data.
//
// Cards sourced from pokemontcg.io carry a `pokemon_api_id` (e.g. "sv4-1").
// Cards sourced from JustTCG (promos / brand-new cards pokemontcg.io lacks)
// carry only a `tcgplayer_id`; for those we synthesize a `tcg:<id>` key.
// Manually-added cards have neither, so — given the card row's UUID — we fall
// back to a `manual:<cardId>` key. That still lets the engine attempt a JustTCG
// resolution by name/number/set (and cache the discovered tcgplayer_id), so a
// hand-entered card can pick up a price if any source actually has it.
//
// Returns null only when the card is manual AND no cardId is supplied.
export function priceApiId(gd: Record<string, unknown>, cardId?: string | null): string | null {
  const pokemonApiId = gd.pokemon_api_id as string | undefined;
  if (pokemonApiId) return pokemonApiId;
  const tcgId = gd.tcgplayer_id as string | undefined;
  if (tcgId) return `tcg:${tcgId}`;
  return cardId ? `manual:${cardId}` : null;
}
