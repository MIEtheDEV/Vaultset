import { speciesName, speciesSlug } from "@/lib/cards/species";

describe("speciesName", () => {
  it.each([
    ["Charizard ex", "Charizard"],
    ["Pikachu VMAX", "Pikachu"],
    ["Zacian V", "Zacian"],
    ["Charizard VSTAR", "Charizard"],
    ["M Charizard EX", "Charizard"],
    ["Mewtwo & Mew GX", "Mewtwo"],
    ["Crobat - 093/086", "Crobat"],
    ["Riolu 010/086", "Riolu"],
    ["Charizard", "Charizard"],
    ["Mr. Mime", "Mr. Mime"],
  ])("%s → %s", (input, expected) => {
    expect(speciesName(input)).toBe(expected);
  });
});

describe("speciesSlug", () => {
  it.each([
    ["Charizard ex", "charizard"],
    ["Mr. Mime", "mr-mime"],
    ["Crobat - 093/086", "crobat"],
    ["Farfetch'd", "farfetch-d"],
  ])("%s → %s", (input, expected) => {
    expect(speciesSlug(input)).toBe(expected);
  });
});
