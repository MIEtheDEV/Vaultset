import { render, screen, fireEvent } from "@testing-library/react";
import { RaritySelect } from "@/components/RaritySelect";

describe("RaritySelect", () => {
  it("shows the placeholder and no options until opened", () => {
    render(<RaritySelect value="" onChange={() => {}} />);
    expect(screen.getByText("Select rarity")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens on click and renders grouped options each with a symbol", () => {
    render(<RaritySelect value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    // Every option renders an inline SVG symbol next to its label.
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(5);
    options.forEach((o) => expect(o.querySelector("svg")).not.toBeNull());
    // Group headers from the taxonomy are present.
    expect(screen.getByText(/Scarlet & Violet/)).toBeInTheDocument();
    expect(screen.getByText(/Legacy/)).toBeInTheDocument();
  });

  it("calls onChange with the chosen key and shows its symbol on the button", () => {
    const onChange = jest.fn();
    const { rerender } = render(<RaritySelect value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: /Double Rare/ }));
    expect(onChange).toHaveBeenCalledWith("double_rare");

    // Reflect the controlled value: button now shows the symbol + label.
    rerender(<RaritySelect value="double_rare" onChange={onChange} />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Double Rare");
    expect(button.querySelector("svg[role='img']")).not.toBeNull();
  });

  it("shows the selected label for the corrected Hyper Rare key", () => {
    render(<RaritySelect value="hyper_rare" onChange={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("Hyper Rare");
  });
});
