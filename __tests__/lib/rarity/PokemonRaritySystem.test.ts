import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";

describe("PokemonRaritySystem", () => {
  let system: PokemonRaritySystem;

  beforeEach(() => {
    system = new PokemonRaritySystem();
  });

  describe("game", () => {
    it("identifies as pokemon", () => {
      expect(system.game).toBe("pokemon");
    });
  });

  describe("getVariantInfo", () => {
    it("returns gold card / gold etched for hyper_rare", () => {
      const info = system.getVariantInfo("hyper_rare");
      expect(info?.variantKey).toBe("gold_card");
      expect(info?.finishKey).toBe("gold_etched");
      expect(info?.finishLabel).toBe("Gold Etched");
    });

    it("returns gold card / gold etched for mega_hyper_rare", () => {
      const info = system.getVariantInfo("mega_hyper_rare");
      expect(info?.variantKey).toBe("gold_card");
      expect(info?.finishKey).toBe("gold_etched");
    });

    it("returns correct variant and finish for double_rare", () => {
      const info = system.getVariantInfo("double_rare");
      expect(info?.variantKey).toBe("standard_ex");
      expect(info?.finishKey).toBe("holofoil");
    });

    it("returns correct variant and finish for ultra_rare", () => {
      const info = system.getVariantInfo("ultra_rare");
      expect(info?.variantKey).toBe("full_art");
      expect(info?.finishKey).toBe("textured_holofoil");
    });

    it("returns correct variant and finish for special_illustration_rare", () => {
      const info = system.getVariantInfo("special_illustration_rare");
      expect(info?.variantKey).toBe("special_illustration_rare");
      expect(info?.finishKey).toBe("textured_holofoil");
    });

    it("returns correct variant and finish for mega_attack_rare", () => {
      const info = system.getVariantInfo("mega_attack_rare");
      expect(info?.variantKey).toBe("mega_attack_rare");
      expect(info?.finishKey).toBe("textured_holofoil");
      expect(info?.variantLabel).toBe("Mega Attack Rare");
    });

    it("returns null for common / uncommon / rare — finish is user-selectable", () => {
      expect(system.getVariantInfo("common")).toBeNull();
      expect(system.getVariantInfo("uncommon")).toBeNull();
      expect(system.getVariantInfo("rare")).toBeNull();
    });

    it("returns null for unknown rarity", () => {
      expect(system.getVariantInfo("not_a_real_rarity")).toBeNull();
    });

    it("resolves the deprecated secret_rare key to the Secret Rare gold card", () => {
      const info = system.getVariantInfo("secret_rare");
      expect(info?.variantKey).toBe("gold_card");
    });
  });

  describe("getSortOrder", () => {
    it("mega_hyper_rare has the highest sort priority (0)", () => {
      expect(system.getSortOrder("mega_hyper_rare")).toBe(0);
    });

    it("hyper_rare sorts just below mega_hyper_rare", () => {
      expect(system.getSortOrder("hyper_rare")).toBe(1);
      expect(system.getSortOrder("hyper_rare")).toBeGreaterThan(system.getSortOrder("mega_hyper_rare"));
    });

    it("common has the lowest sort priority", () => {
      expect(system.getSortOrder("common")).toBe(17);
    });

    it("returns 999 for unknown rarity", () => {
      expect(system.getSortOrder("unknown_rarity")).toBe(999);
    });

    it("special_illustration_rare sorts above illustration_rare", () => {
      expect(system.getSortOrder("special_illustration_rare")).toBeLessThan(
        system.getSortOrder("illustration_rare")
      );
    });

    it("illustration_rare sorts above common", () => {
      expect(system.getSortOrder("illustration_rare")).toBeLessThan(
        system.getSortOrder("common")
      );
    });

    it("orders by pip color: all gold above silver above black", () => {
      const gold = ["mega_hyper_rare", "hyper_rare", "special_illustration_rare", "illustration_rare", "rare_secret"];
      const silver = ["ultra_rare"];
      const black = ["double_rare", "rare_ultra", "rare_holo", "rare"];
      const maxGold = Math.max(...gold.map((r) => system.getSortOrder(r)));
      const minSilver = Math.min(...silver.map((r) => system.getSortOrder(r)));
      const minBlack = Math.min(...black.map((r) => system.getSortOrder(r)));
      // lower number = higher rarity, so gold's worst still beats silver, silver beats black
      expect(maxGold).toBeLessThan(minSilver);
      expect(minSilver).toBeLessThan(minBlack);
    });

    it("ranks Illustration Rare above Ultra Rare (gold pip over silver — its true pull rate)", () => {
      expect(system.getSortOrder("illustration_rare")).toBeLessThan(system.getSortOrder("ultra_rare"));
    });
  });

  describe("getDisplayLabel", () => {
    it("returns human-readable label for common", () => {
      expect(system.getDisplayLabel("common")).toBe("Common");
    });

    it("labels hyper_rare as Hyper Rare (distinct from Mega Hyper Rare)", () => {
      expect(system.getDisplayLabel("hyper_rare")).toBe("Hyper Rare");
      expect(system.getDisplayLabel("mega_hyper_rare")).toBe("Mega Hyper Rare");
    });

    it("labels the consolidated legacy Ultra Rare tier", () => {
      expect(system.getDisplayLabel("rare_ultra")).toBe("Ultra Rare (Full Art)");
    });

    it("returns human-readable label for special_illustration_rare", () => {
      expect(system.getDisplayLabel("special_illustration_rare")).toBe(
        "Special Illustration Rare"
      );
    });

    it("resolves deprecated keys through the alias map", () => {
      expect(system.getDisplayLabel("secret_rare")).toBe("Secret Rare");
      expect(system.getDisplayLabel("rare_holo_vmax")).toBe("Ultra Rare (Full Art)");
      expect(system.getDisplayLabel("rare_holo_v")).toBe("Ultra Rare (Full Art)");
    });

    it("falls back to the rarity key for unknown rarities", () => {
      expect(system.getDisplayLabel("some_unknown_rarity")).toBe(
        "some_unknown_rarity"
      );
    });
  });

  describe("getSymbol", () => {
    it("returns shape + color for the base modern rarities", () => {
      expect(system.getSymbol("common")).toEqual({ shape: "circle", color: "black" });
      expect(system.getSymbol("uncommon")).toEqual({ shape: "diamond", color: "black" });
      expect(system.getSymbol("rare")).toEqual({ shape: "star", color: "black" });
    });

    it("distinguishes the two-star tiers by color", () => {
      expect(system.getSymbol("double_rare")).toEqual({ shape: "double_star", color: "black" });
      expect(system.getSymbol("ultra_rare")).toEqual({ shape: "double_star", color: "silver" });
      expect(system.getSymbol("special_illustration_rare")).toEqual({ shape: "double_star", color: "gold" });
      expect(system.getSymbol("mega_attack_rare")).toEqual({ shape: "double_star", color: "two_tone" });
    });

    it("gives Hyper Rare a triple star and Mega Hyper Rare a starburst", () => {
      expect(system.getSymbol("hyper_rare")).toEqual({ shape: "triple_star", color: "gold" });
      expect(system.getSymbol("mega_hyper_rare")).toEqual({ shape: "starburst", color: "gold" });
    });

    it("gives illustration rare a gold star and ACE SPEC a magenta badge", () => {
      expect(system.getSymbol("illustration_rare")).toEqual({ shape: "star", color: "gold" });
      expect(system.getSymbol("ace_spec_rare")).toEqual({ shape: "ace_badge", color: "magenta" });
    });

    it("colors the legacy tiers by their real symbol / card treatment", () => {
      // Legacy pips are black stars; the two 'secret' tiers take their card-treatment color.
      expect(system.getSymbol("rare_holo")).toEqual({ shape: "star", color: "black" });
      expect(system.getSymbol("rare_ultra")).toEqual({ shape: "star", color: "black" });
      expect(system.getSymbol("rare_rainbow")).toEqual({ shape: "star", color: "rainbow" });
      expect(system.getSymbol("rare_secret")).toEqual({ shape: "star", color: "gold" });
    });

    it("resolves deprecated keys to the canonical symbol", () => {
      expect(system.getSymbol("secret_rare")).toEqual({ shape: "star", color: "gold" });   // -> rare_secret
      expect(system.getSymbol("rare_holo_vmax")).toEqual({ shape: "star", color: "black" }); // -> rare_ultra
    });

    it("returns null for unknown rarities", () => {
      expect(system.getSymbol("not_a_real_rarity")).toBeNull();
    });
  });

  describe("isFinishLocked (inherited from RaritySystem)", () => {
    it("returns true for rarities with a fixed finish", () => {
      expect(system.isFinishLocked("hyper_rare")).toBe(true);
      expect(system.isFinishLocked("mega_hyper_rare")).toBe(true);
      expect(system.isFinishLocked("double_rare")).toBe(true);
      expect(system.isFinishLocked("ultra_rare")).toBe(true);
      expect(system.isFinishLocked("rare_holo")).toBe(true);
    });

    it("returns false for common / uncommon / rare — user selects finish", () => {
      expect(system.isFinishLocked("common")).toBe(false);
      expect(system.isFinishLocked("uncommon")).toBe(false);
      expect(system.isFinishLocked("rare")).toBe(false);
    });
  });

  describe("getRarityOptions", () => {
    it("returns exactly two groups (modern, legacy)", () => {
      const groups = system.getRarityOptions();
      expect(groups).toHaveLength(2);
      expect(groups[0].group).toContain("Scarlet & Violet");
      expect(groups[1].group).toContain("Legacy");
    });

    it("every option has a non-empty value and label", () => {
      system.getRarityOptions().forEach((group) => {
        group.options.forEach((option) => {
          expect(option.value).toBeTruthy();
          expect(option.label).toBeTruthy();
        });
      });
    });

    it("modern group includes both hyper tiers and mega attack rare", () => {
      const values = system.getRarityOptions()[0].options.map((o) => o.value);
      expect(values).toContain("hyper_rare");
      expect(values).toContain("mega_hyper_rare");
      expect(values).toContain("mega_attack_rare");
    });

    it("legacy group offers the consolidated Ultra Rare, not the retired V/VMAX/VSTAR keys", () => {
      const values = system.getRarityOptions()[1].options.map((o) => o.value);
      expect(values).toContain("rare_ultra");
      expect(values).not.toContain("rare_holo_vmax");
      expect(values).not.toContain("rare_holo_v");
    });

    it("does not offer promo in the dropdown (set via the promo toggle instead)", () => {
      const allValues = system.getRarityOptions().flatMap((g) => g.options.map((o) => o.value));
      expect(allValues).not.toContain("promo");
    });

    it("lists each era group rarest-first (pip-color order)", () => {
      const [modern, legacy] = system.getRarityOptions();
      expect(modern.options[0].value).toBe("mega_hyper_rare");
      expect(modern.options[modern.options.length - 1].value).toBe("common");
      expect(legacy.options[0].value).toBe("rare_secret"); // gold, ahead of black rare_holo
    });
  });
});
