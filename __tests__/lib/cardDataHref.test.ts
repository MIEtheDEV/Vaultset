import { cardDataHref } from "@/components/VaultCardTile";

// The three identity shapes `/card-data/[id]` accepts, mirroring `priceApiId`.
describe("cardDataHref", () => {
  it("prefers the pokemontcg.io id", () => {
    expect(cardDataHref({ id: "row-1", game_data: { pokemon_api_id: "sv10-184" } }))
      .toBe("/card-data/sv10-184");
  });

  it("falls back to a tcg: key, percent-encoding the colon", () => {
    // The route decodes once on entry; an unencoded colon would miss its
    // `startsWith("tcg:")` check and 404 the card.
    expect(cardDataHref({ id: "row-1", game_data: { tcgplayer_id: "590072" } }))
      .toBe("/card-data/tcg%3A590072");
  });

  it("falls back to a manual: key built from the card row id", () => {
    expect(cardDataHref({ id: "abc-123", game_data: {} }))
      .toBe("/card-data/manual%3Aabc-123");
  });

  it("prefers pokemon_api_id over tcgplayer_id when both exist", () => {
    expect(cardDataHref({ id: "row-1", game_data: { pokemon_api_id: "sv4-1", tcgplayer_id: "999" } }))
      .toBe("/card-data/sv4-1");
  });

  it("returns null when the card can't be addressed, so the tile renders unlinked", () => {
    expect(cardDataHref(null)).toBeNull();
    expect(cardDataHref(undefined)).toBeNull();
    expect(cardDataHref({ id: null, game_data: {} })).toBeNull();
    expect(cardDataHref({})).toBeNull();
  });
});
