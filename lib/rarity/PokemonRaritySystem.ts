import { RaritySystem, RarityVariantInfo, RarityGroup } from "./RaritySystem";

// Concrete implementation of RaritySystem for the Pokémon TCG.
// All Pokémon-specific rarity rules live here — inherited convenience
// methods (isFinishLocked) work automatically via the base class.
export class PokemonRaritySystem extends RaritySystem {
  readonly game = "pokemon";

  private readonly VARIANT_MAP: Record<string, RarityVariantInfo> = {
    ace_spec_rare:             { variantKey: "ace_spec",                  variantLabel: "ACE SPEC",                               finishKey: "holofoil",          finishLabel: "Holofoil" },
    double_rare:               { variantKey: "standard_ex",              variantLabel: "Standard ex",                            finishKey: "holofoil",          finishLabel: "Holofoil" },
    ultra_rare:                { variantKey: "full_art",                  variantLabel: "Full Art",                               finishKey: "textured_holofoil", finishLabel: "Textured Holofoil" },
    illustration_rare:         { variantKey: "illustration_rare",         variantLabel: "Illustration Rare (Alt Art)",            finishKey: "holofoil",          finishLabel: "Holofoil" },
    special_illustration_rare: { variantKey: "special_illustration_rare", variantLabel: "Special Illustration Rare (Alt Art ex)", finishKey: "textured_holofoil", finishLabel: "Textured Holofoil" },
    mega_attack_rare:          { variantKey: "mega_attack_rare",          variantLabel: "Mega Attack Rare",                       finishKey: "textured_holofoil", finishLabel: "Textured Holofoil" },
    hyper_rare:                { variantKey: "gold_card",                 variantLabel: "Gold Card",                              finishKey: "gold_etched",       finishLabel: "Gold Etched" },
    secret_rare:               { variantKey: "secret_rare",               variantLabel: "Secret Rare",                            finishKey: "gold_etched",       finishLabel: "Gold Etched" },
    rare_holo:                 { variantKey: "standard_holo",             variantLabel: "Standard Holo",                          finishKey: "holofoil",          finishLabel: "Holofoil" },
    rare_holo_v:               { variantKey: "standard_v",                variantLabel: "Standard V",                             finishKey: "holofoil",          finishLabel: "Holofoil" },
    rare_holo_vmax:            { variantKey: "vmax",                      variantLabel: "VMAX",                                   finishKey: "holofoil",          finishLabel: "Holofoil" },
    rare_holo_vstar:           { variantKey: "vstar",                     variantLabel: "VSTAR",                                  finishKey: "holofoil",          finishLabel: "Holofoil" },
    rare_ultra:                { variantKey: "full_art",                  variantLabel: "Full Art",                               finishKey: "holofoil",          finishLabel: "Holofoil" },
    rare_rainbow:              { variantKey: "rainbow_rare",              variantLabel: "Rainbow Rare",                           finishKey: "textured_holofoil", finishLabel: "Textured Holofoil" },
    rare_secret:               { variantKey: "gold_card",                 variantLabel: "Gold Card",                              finishKey: "gold_etched",       finishLabel: "Gold Etched" },
    rare_shiny:                { variantKey: "shiny_rare",                variantLabel: "Shiny Rare",                             finishKey: "holofoil",          finishLabel: "Holofoil" },
    rare_shiny_gx:             { variantKey: "shiny_gx",                  variantLabel: "Shiny GX",                               finishKey: "textured_holofoil", finishLabel: "Textured Holofoil" },
  };

  private readonly SORT_ORDER: Record<string, number> = {
    hyper_rare:                0,
    special_illustration_rare: 1,
    mega_attack_rare:          2,
    ultra_rare:                2,
    rare_rainbow:              3,
    rare_secret:               3,
    secret_rare:               3,
    rare_shiny_gx:             4,
    illustration_rare:         5,
    rare_shiny:                6,
    ace_spec_rare:             6,
    double_rare:               7,
    rare_holo_vmax:            8,
    rare_holo_vstar:           9,
    rare_ultra:                10,
    rare_holo_v:               11,
    promo:                     12,
    rare_holo:                 12,
    rare:                      13,
    uncommon:                  14,
    common:                    15,
  };

  private readonly DISPLAY_LABELS: Record<string, string> = {
    common:                    "Common",
    uncommon:                  "Uncommon",
    rare:                      "Rare",
    rare_holo:                 "Rare Holo",
    ace_spec_rare:             "ACE SPEC Rare",
    double_rare:               "Double Rare",
    ultra_rare:                "Ultra Rare",
    illustration_rare:         "Illustration Rare",
    special_illustration_rare: "Special Illustration Rare",
    mega_attack_rare:          "Mega Attack Rare",
    hyper_rare:                "Mega Hyper Rare",
    secret_rare:               "Secret Rare",
    rare_holo_v:               "Rare Holo V",
    rare_holo_vmax:            "Rare Holo VMAX",
    rare_holo_vstar:           "Rare Holo VSTAR",
    rare_ultra:                "Rare Ultra",
    rare_rainbow:              "Rare Rainbow",
    rare_secret:               "Rare Secret",
    rare_shiny:                "Rare Shiny",
    rare_shiny_gx:             "Rare Shiny GX",
    promo:                     "Promo",
  };

  getVariantInfo(rarity: string): RarityVariantInfo | null {
    return this.VARIANT_MAP[rarity] ?? null;
  }

  getSortOrder(rarity: string): number {
    return this.SORT_ORDER[rarity] ?? 999;
  }

  getDisplayLabel(rarity: string): string {
    return this.DISPLAY_LABELS[rarity] ?? rarity;
  }

  getRarityOptions(): RarityGroup[] {
    return [
      {
        group: "Modern — Scarlet & Violet (2023+)",
        options: [
          { value: "common",                    label: "Common" },
          { value: "uncommon",                  label: "Uncommon" },
          { value: "rare",                      label: "Rare" },
          { value: "ace_spec_rare",             label: "ACE SPEC Rare" },
          { value: "double_rare",               label: "Double Rare" },
          { value: "ultra_rare",                label: "Ultra Rare" },
          { value: "illustration_rare",         label: "Illustration Rare" },
          { value: "special_illustration_rare", label: "Special Illustration Rare" },
          { value: "mega_attack_rare",          label: "Mega Attack Rare" },
          { value: "hyper_rare",                label: "Mega Hyper Rare" },
          { value: "secret_rare",               label: "Secret Rare" },
        ],
      },
      {
        group: "Legacy — Sword & Shield / Sun & Moon",
        options: [
          { value: "rare_holo",                 label: "Rare Holo" },
          { value: "rare_holo_v",               label: "Rare Holo V" },
          { value: "rare_holo_vmax",            label: "Rare Holo VMAX" },
          { value: "rare_holo_vstar",           label: "Rare Holo VSTAR" },
          { value: "rare_ultra",                label: "Rare Ultra (Full Art)" },
          { value: "rare_rainbow",              label: "Rare Rainbow" },
          { value: "rare_secret",               label: "Rare Secret (Gold)" },
          { value: "rare_shiny",                label: "Rare Shiny" },
          { value: "rare_shiny_gx",             label: "Rare Shiny GX" },
        ],
      },
    ];
  }
}
