import { getSearchProvider, PokemonTCGProvider } from "@/lib/search";

describe("getSearchProvider", () => {
  it("returns a PokemonTCGProvider for the pokemon game key", () => {
    const provider = getSearchProvider("pokemon");
    expect(provider).toBeInstanceOf(PokemonTCGProvider);
    expect(provider.game).toBe("pokemon");
  });

  it("falls back to the pokemon provider for an unregistered game", () => {
    const provider = getSearchProvider("magic_the_gathering");
    expect(provider).toBeInstanceOf(PokemonTCGProvider);
  });

  it("returns the same instance on repeated calls", () => {
    const a = getSearchProvider("pokemon");
    const b = getSearchProvider("pokemon");
    expect(a).toBe(b);
  });
});
