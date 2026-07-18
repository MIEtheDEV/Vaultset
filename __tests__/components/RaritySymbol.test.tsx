import { render } from "@testing-library/react";
import { RaritySymbol, RarityLabel } from "@/components/RaritySymbol";

describe("RaritySymbol", () => {
  function svgOf(rarity: string) {
    const { container } = render(<RaritySymbol rarity={rarity} />);
    return container.querySelector("svg");
  }

  it("renders an svg for a known rarity", () => {
    const svg = svgOf("rare");
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll("path").length).toBe(1); // single star
  });

  it("tiles one path per star for multi-star tiers", () => {
    expect(svgOf("double_rare")!.querySelectorAll("path").length).toBe(2);
    expect(svgOf("hyper_rare")!.querySelectorAll("path").length).toBe(3);
  });

  it("renders a circle for common and a starburst path for mega hyper rare", () => {
    expect(svgOf("common")!.querySelector("circle")).not.toBeNull();
    expect(svgOf("mega_hyper_rare")!.querySelectorAll("path").length).toBe(1);
  });

  it("defines a gold gradient for gold rarities and none for black ones", () => {
    expect(svgOf("hyper_rare")!.querySelector("linearGradient")).not.toBeNull();
    expect(svgOf("rare")!.querySelector("linearGradient")).toBeNull(); // black => currentColor
  });

  it("renders the ACE SPEC badge with its letter", () => {
    const svg = svgOf("ace_spec_rare")!;
    expect(svg.querySelector("rect")).not.toBeNull();
    expect(svg.querySelector("text")?.textContent).toBe("A");
  });

  it("renders nothing for an unknown rarity", () => {
    const { container } = render(<RaritySymbol rarity="not_real" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("resolves deprecated keys to the canonical symbol", () => {
    // secret_rare -> rare_secret (gold star)
    expect(svgOf("secret_rare")!.querySelectorAll("path").length).toBe(1);
    expect(svgOf("secret_rare")!.querySelector("linearGradient")).not.toBeNull();
  });

  it("renders a rainbow gradient for Rare Rainbow", () => {
    const svg = svgOf("rare_rainbow")!;
    expect(svg.querySelector("linearGradient")).not.toBeNull();
    expect(svg.querySelectorAll("linearGradient stop").length).toBe(5);
  });
});

describe("RarityLabel", () => {
  it("renders the symbol followed by the display label", () => {
    const { container, getByText } = render(<RarityLabel rarity="mega_hyper_rare" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(getByText("Mega Hyper Rare")).toBeInTheDocument();
  });

  it("shows the corrected Hyper Rare label (not Mega Hyper Rare)", () => {
    const { getByText } = render(<RarityLabel rarity="hyper_rare" />);
    expect(getByText("Hyper Rare")).toBeInTheDocument();
  });
});
