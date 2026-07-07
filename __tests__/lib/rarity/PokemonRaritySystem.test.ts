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
    it("returns correct variant and finish for hyper_rare", () => {
      const info = system.getVariantInfo("hyper_rare");
      expect(info).not.toBeNull();
      expect(info?.variantKey).toBe("gold_card");
      expect(info?.finishKey).toBe("gold_etched");
      expect(info?.finishLabel).toBe("Gold Etched");
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
      expect(info).not.toBeNull();
      expect(info?.variantKey).toBe("mega_attack_rare");
      expect(info?.finishKey).toBe("textured_holofoil");
      expect(info?.variantLabel).toBe("Mega Attack Rare");
    });

    it("returns null for common — finish is user-selectable", () => {
      expect(system.getVariantInfo("common")).toBeNull();
    });

    it("returns null for uncommon — finish is user-selectable", () => {
      expect(system.getVariantInfo("uncommon")).toBeNull();
    });

    it("returns null for rare — finish is user-selectable", () => {
      expect(system.getVariantInfo("rare")).toBeNull();
    });

    it("returns null for unknown rarity", () => {
      expect(system.getVariantInfo("not_a_real_rarity")).toBeNull();
    });
  });

  describe("getSortOrder", () => {
    it("hyper_rare has the highest sort priority (0)", () => {
      expect(system.getSortOrder("hyper_rare")).toBe(0);
    });

    it("common has the lowest sort priority", () => {
      expect(system.getSortOrder("common")).toBe(15);
    });

    it("returns 999 for unknown rarity", () => {
      expect(system.getSortOrder("unknown_rarity")).toBe(999);
    });

    it("hyper_rare sorts above special_illustration_rare", () => {
      expect(system.getSortOrder("hyper_rare")).toBeLessThan(
        system.getSortOrder("special_illustration_rare")
      );
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
  });

  describe("getDisplayLabel", () => {
    it("returns human-readable label for common", () => {
      expect(system.getDisplayLabel("common")).toBe("Common");
    });

    it("returns human-readable label for hyper_rare", () => {
      expect(system.getDisplayLabel("hyper_rare")).toBe("Mega Hyper Rare");
    });

    it("returns human-readable label for double_rare", () => {
      expect(system.getDisplayLabel("double_rare")).toBe("Double Rare");
    });

    it("returns human-readable label for special_illustration_rare", () => {
      expect(system.getDisplayLabel("special_illustration_rare")).toBe(
        "Special Illustration Rare"
      );
    });

    it("falls back to the rarity key for unknown rarities", () => {
      expect(system.getDisplayLabel("some_unknown_rarity")).toBe(
        "some_unknown_rarity"
      );
    });
  });

  describe("isFinishLocked (inherited from RaritySystem)", () => {
    it("returns true for rarities with a fixed finish", () => {
      expect(system.isFinishLocked("hyper_rare")).toBe(true);
      expect(system.isFinishLocked("double_rare")).toBe(true);
      expect(system.isFinishLocked("ultra_rare")).toBe(true);
      expect(system.isFinishLocked("rare_holo")).toBe(true);
    });

    it("returns false for common — user selects finish", () => {
      expect(system.isFinishLocked("common")).toBe(false);
    });

    it("returns false for uncommon — user selects finish", () => {
      expect(system.isFinishLocked("uncommon")).toBe(false);
    });

    it("returns false for rare — user selects finish", () => {
      expect(system.isFinishLocked("rare")).toBe(false);
    });
  });

  describe("getRarityOptions", () => {
    it("returns exactly two groups", () => {
      expect(system.getRarityOptions()).toHaveLength(2);
    });

    it("first group is the modern Scarlet & Violet era", () => {
      const groups = system.getRarityOptions();
      expect(groups[0].group).toContain("Scarlet & Violet");
    });

    it("second group is the legacy era", () => {
      const groups = system.getRarityOptions();
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

    it("modern group includes hyper_rare", () => {
      const modern = system.getRarityOptions()[0];
      const values = modern.options.map((o) => o.value);
      expect(values).toContain("hyper_rare");
    });

    it("modern group includes mega_attack_rare", () => {
      const modern = system.getRarityOptions()[0];
      const values = modern.options.map((o) => o.value);
      expect(values).toContain("mega_attack_rare");
    });

    it("legacy group includes rare_holo_vmax", () => {
      const legacy = system.getRarityOptions()[1];
      const values = legacy.options.map((o) => o.value);
      expect(values).toContain("rare_holo_vmax");
    });
  });
});
