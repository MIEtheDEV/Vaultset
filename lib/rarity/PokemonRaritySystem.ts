import {
  RaritySystem,
  RarityVariantInfo,
  RarityGroup,
  RaritySymbolInfo,
  RaritySymbolShape,
  RaritySymbolColor,
} from "./RaritySystem";

// Concrete implementation of RaritySystem for the Pokémon TCG.
//
// Everything about a rarity — its label, dropdown group, sort weight, locked
// variant/finish, and its stamped symbol (shape + color) — is declared once in
// the RARITIES table below and derived from there. Add or change a rarity in a
// single place. Inherited convenience methods (isFinishLocked) work automatically
// via the base class.
//
// Taxonomy follows the curated modern (Scarlet & Violet 2023+) and legacy
// (Sword & Shield / Sun & Moon) lists. Legacy V / VMAX / VSTAR / GX are
// consolidated into a single "Ultra Rare (Full Art)" tier; Hyper Rare (triple
// gold star) and Mega Hyper Rare (gold starburst) are distinct. Deprecated keys
// left in stored data resolve through ALIASES so nothing ever renders blank.

type DropdownGroup = "modern" | "legacy" | null; // null = valid key, hidden from the dropdown

interface RarityMeta {
  key:    string;
  label:  string;
  group:  DropdownGroup;
  shape:  RaritySymbolShape;
  color:  RaritySymbolColor;
  sort:   number;                 // lower = higher rarity
  variant?: RarityVariantInfo;    // present ⇒ finish is locked (not user-selectable)
}

const HOLO         = { finishKey: "holofoil",          finishLabel: "Holofoil" };
const TEXTURED     = { finishKey: "textured_holofoil", finishLabel: "Textured Holofoil" };
const GOLD_ETCHED  = { finishKey: "gold_etched",       finishLabel: "Gold Etched" };

const RARITIES: RarityMeta[] = [
  // Ordered rarest → least by PIP COLOR (gold > silver > black) — matching the
  // symbols and Pokémon's own rarity signal, not a raw value ladder — so gold
  // cards cluster, then silver, then black. `sort` equals the array index, so
  // the picker (getRarityOptions, split into era groups) and every "highest
  // first" sort share this one order. Two-tone (Mega Attack), rainbow (legacy
  // Rare Rainbow) and the magenta ACE SPEC badge slot between silver and black.
  // Legacy note: the colored-pip system is a modern (S&V) thing — legacy pips
  // are physically black stars; only the two "secret" tiers are colored (gold /
  // rainbow) by card treatment so they stay distinguishable.

  // ── Gold pip — top tier ──────────────────────────────────────────────────────
  { key: "mega_hyper_rare",           label: "Mega Hyper Rare",           group: "modern", shape: "starburst",   color: "gold",     sort: 0,
    variant: { variantKey: "gold_card",                 variantLabel: "Gold Card",                              ...GOLD_ETCHED } },
  { key: "hyper_rare",                label: "Hyper Rare",                group: "modern", shape: "triple_star", color: "gold",     sort: 1,
    variant: { variantKey: "gold_card",                 variantLabel: "Gold Card",                              ...GOLD_ETCHED } },
  { key: "special_illustration_rare", label: "Special Illustration Rare", group: "modern", shape: "double_star", color: "gold",     sort: 2,
    variant: { variantKey: "special_illustration_rare", variantLabel: "Special Illustration Rare (Alt Art ex)", ...TEXTURED } },
  { key: "illustration_rare",         label: "Illustration Rare",         group: "modern", shape: "star",        color: "gold",     sort: 3,
    variant: { variantKey: "illustration_rare",         variantLabel: "Illustration Rare (Alt Art)",            ...HOLO } },
  { key: "rare_secret",               label: "Secret Rare",               group: "legacy", shape: "star",        color: "gold",     sort: 4,
    variant: { variantKey: "gold_card",                 variantLabel: "Gold Card",                              ...GOLD_ETCHED } },

  // ── Two-tone / rainbow specials ──────────────────────────────────────────────
  { key: "mega_attack_rare",          label: "Mega Attack Rare",          group: "modern", shape: "double_star", color: "two_tone", sort: 5,
    variant: { variantKey: "mega_attack_rare",          variantLabel: "Mega Attack Rare",                       ...TEXTURED } },
  { key: "rare_rainbow",              label: "Rare Rainbow",              group: "legacy", shape: "star",        color: "rainbow",  sort: 6,
    variant: { variantKey: "rainbow_rare",              variantLabel: "Rainbow Rare",                           ...TEXTURED } },

  // ── Silver pip ───────────────────────────────────────────────────────────────
  { key: "ultra_rare",                label: "Ultra Rare",                group: "modern", shape: "double_star", color: "silver",   sort: 7,
    variant: { variantKey: "full_art",                  variantLabel: "Full Art",                               ...TEXTURED } },
  { key: "rare_shiny_gx",             label: "Rare Shiny GX",            group: null,     shape: "double_star", color: "silver",   sort: 8,
    variant: { variantKey: "shiny_gx",                  variantLabel: "Shiny GX",                               ...TEXTURED } },
  { key: "rare_shiny",                label: "Rare Shiny",                group: null,     shape: "star",        color: "silver",   sort: 9,
    variant: { variantKey: "shiny_rare",                variantLabel: "Shiny Rare",                             ...HOLO } },

  // ── ACE SPEC (magenta text block) ────────────────────────────────────────────
  { key: "ace_spec_rare",             label: "ACE SPEC Rare",             group: "modern", shape: "ace_badge",   color: "magenta",  sort: 10,
    variant: { variantKey: "ace_spec",                  variantLabel: "ACE SPEC",                               ...HOLO } },

  // ── Black pip ────────────────────────────────────────────────────────────────
  { key: "double_rare",               label: "Double Rare",               group: "modern", shape: "double_star", color: "black",    sort: 11,
    variant: { variantKey: "standard_ex",               variantLabel: "Standard ex",                            ...HOLO } },
  { key: "rare_ultra",                label: "Ultra Rare (Full Art)",     group: "legacy", shape: "star",        color: "black",    sort: 12,
    variant: { variantKey: "full_art",                  variantLabel: "Full Art",                               ...HOLO } },
  { key: "rare_holo",                 label: "Rare Holo",                 group: "legacy", shape: "star",        color: "black",    sort: 13,
    variant: { variantKey: "standard_holo",             variantLabel: "Standard Holo",                          ...HOLO } },
  { key: "promo",                     label: "Promo",                     group: null,     shape: "star",        color: "black",    sort: 14 },
  { key: "rare",                      label: "Rare",                      group: "modern", shape: "star",        color: "black",    sort: 15 },
  { key: "uncommon",                  label: "Uncommon",                  group: "modern", shape: "diamond",     color: "black",    sort: 16 },
  { key: "common",                    label: "Common",                    group: "modern", shape: "circle",      color: "black",    sort: 17 },
];

// Deprecated keys that may still exist in stored data → their canonical key.
// The one-off DB migration rewrites these, but resolving here keeps display
// robust for anything the migration didn't touch.
const ALIASES: Record<string, string> = {
  secret_rare:    "rare_secret",   // modern gold Secret Rare → the single Secret Rare tier
  rare_holo_v:    "rare_ultra",    // V / VMAX / VSTAR consolidated into Ultra Rare (Full Art)
  rare_holo_vmax: "rare_ultra",
  rare_holo_vstar:"rare_ultra",
};

export class PokemonRaritySystem extends RaritySystem {
  readonly game = "pokemon";

  private readonly byKey: Record<string, RarityMeta> = Object.fromEntries(
    RARITIES.map((r) => [r.key, r]),
  );

  /** Resolve a possibly-deprecated key to its canonical metadata. */
  private meta(rarity: string): RarityMeta | undefined {
    return this.byKey[rarity] ?? this.byKey[ALIASES[rarity] ?? ""];
  }

  getVariantInfo(rarity: string): RarityVariantInfo | null {
    return this.meta(rarity)?.variant ?? null;
  }

  getSortOrder(rarity: string): number {
    return this.meta(rarity)?.sort ?? 999;
  }

  getDisplayLabel(rarity: string): string {
    return this.meta(rarity)?.label ?? rarity;
  }

  getSymbol(rarity: string): RaritySymbolInfo | null {
    const m = this.meta(rarity);
    return m ? { shape: m.shape, color: m.color } : null;
  }

  getRarityOptions(): RarityGroup[] {
    const groups: { id: Exclude<DropdownGroup, null>; group: string }[] = [
      { id: "modern", group: "Modern — Scarlet & Violet (2023+)" },
      { id: "legacy", group: "Legacy — Sword & Shield / Sun & Moon" },
    ];
    return groups.map(({ id, group }) => ({
      group,
      options: RARITIES.filter((r) => r.group === id).map((r) => ({ value: r.key, label: r.label })),
    }));
  }
}
