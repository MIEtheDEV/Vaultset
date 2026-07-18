import { getRaritySystem } from "@/lib/rarity";

// Derive the SET of legitimate finishes a single card exists in — the per-card
// "denominator" for master-set completion. This is deliberately distinct from the
// rarity→single-finish lock used for an individual inventory row: a master set
// needs every printing (a common exists as {non_holo, reverse_holofoil}; a rare
// holo as {holofoil, reverse_holofoil}), not just the one a given copy happens to
// be.
//
// Primary signal: the tcgplayer.prices KEYS, which enumerate the actual printings
// TCGplayer tracks. Secondary: the rarity's locked finish, used to RELABEL the
// generic "holofoil" printing to its true collectible finish (textured / gold
// etched) for full-art / secret / hyper rares — pokemontcg.io reports those as a
// single `holofoil` price key even though the physical finish differs.
//
// Honest-limits flag (`fidelity`): Scarlet & Violet-era sets (2023+) carry Poké
// Ball / Master Ball pattern reverse holos that tcgplayer.prices does NOT
// enumerate, and cards with no price data at all are best-guesses — both are
// marked "partial" so the UI can tell the user the count may be incomplete rather
// than silently under-counting.

const raritySystem = getRaritySystem("pokemon");

export type FinishFidelity = "derived" | "partial";

export interface DerivedFinishes {
  finishes: string[];        // subset of the collection_items.finish enum
  fidelity: FinishFidelity;
}

// SV era began 2023 — the first sets with Poké Ball / Master Ball pattern reverses.
const ERA_GAP_YEAR = 2023;

// Canonical display/storage order (base → premium) so stored arrays are
// deterministic regardless of the source's price-key ordering.
export const FINISH_ORDER = ["non_holo", "holofoil", "reverse_holofoil", "textured_holofoil", "gold_etched"];

export const FINISH_LABELS: Record<string, string> = {
  non_holo:          "Normal",
  holofoil:          "Holo",
  reverse_holofoil:  "Reverse Holo",
  textured_holofoil: "Textured",
  gold_etched:       "Gold",
};

const orderOf = (f: string) => {
  const i = FINISH_ORDER.indexOf(f);
  return i === -1 ? FINISH_ORDER.length : i;
};

/** Sort a finish list into canonical (base → premium) order. */
export function sortFinishes(finishes: string[]): string[] {
  return [...finishes].sort((a, b) => orderOf(a) - orderOf(b));
}

export function deriveFinishes(opts: {
  priceKeys?: string[];          // keys of tcgplayer.prices (e.g. ["normal","reverseHolofoil"])
  rarityKey?: string | null;     // internal rarity key (already mapped), or null
  setReleaseYear?: number | null;
}): DerivedFinishes {
  const { priceKeys = [], rarityKey, setReleaseYear } = opts;
  const locked = rarityKey ? raritySystem.getVariantInfo(rarityKey)?.finishKey : undefined;

  const finishes = new Set<string>();
  let sawHolo = false;
  let sawPriceData = false;

  for (const k of priceKeys) {
    sawPriceData = true;
    switch (k) {
      case "normal":
      case "1stEditionNormal":
        finishes.add("non_holo");
        break;
      case "reverseHolofoil":
        finishes.add("reverse_holofoil");
        break;
      case "holofoil":
      case "1stEditionHolofoil":
        sawHolo = true;
        break;
      default:
        break; // unrecognized key — ignore
    }
  }

  if (sawHolo) {
    // Relabel the holo printing to the rarity's true finish when it's a special one.
    if (locked === "textured_holofoil" || locked === "gold_etched") finishes.add(locked);
    else finishes.add("holofoil");
  }

  // No usable price data: fall back to the rarity's locked finish, else a plain card.
  if (finishes.size === 0) {
    finishes.add(locked ?? "non_holo");
  }

  const eraGap = (setReleaseYear ?? 0) >= ERA_GAP_YEAR;
  const fidelity: FinishFidelity = !sawPriceData || eraGap ? "partial" : "derived";

  return { finishes: sortFinishes([...finishes]), fidelity };
}
