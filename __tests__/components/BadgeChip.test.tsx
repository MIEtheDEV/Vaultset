import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BadgeChip } from "@/components/BadgeChip";
import { BADGE_MAP, type BadgeSlug } from "@/lib/badges";

const badge = BADGE_MAP.get("first_card" as BadgeSlug)!;
const other = BADGE_MAP.get("collector" as BadgeSlug)!;

// The tooltip stays mounted and is hidden with `invisible`, so "shown" means visible.
const isShown = (el: HTMLElement) => !el.className.includes("invisible");

describe("BadgeChip details tooltip", () => {
  it("is hidden until the badge is activated", () => {
    render(<BadgeChip badge={badge} earned earnedAt={new Date(0).toISOString()} />);
    expect(isShown(screen.getByRole("tooltip", { hidden: true }))).toBe(false);
  });

  it("opens on tap and closes on a second tap", async () => {
    const user = userEvent.setup();
    render(<BadgeChip badge={badge} earned earnedAt={new Date(0).toISOString()} />);

    const button = screen.getByRole("button");
    await user.pointer({ keys: "[TouchA]", target: button });

    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(isShown(tooltip)).toBe(true);
    expect(tooltip).toHaveTextContent(badge.label);
    expect(tooltip).toHaveTextContent(badge.description);

    await user.pointer({ keys: "[TouchA]", target: button });
    expect(isShown(screen.getByRole("tooltip", { hidden: true }))).toBe(false);
  });

  it("opens on mouse hover and closes when the pointer leaves", async () => {
    const user = userEvent.setup();
    render(<BadgeChip badge={badge} earned />);

    const button = screen.getByRole("button");
    await user.hover(button);
    expect(isShown(screen.getByRole("tooltip", { hidden: true }))).toBe(true);

    await user.unhover(button);
    expect(isShown(screen.getByRole("tooltip", { hidden: true }))).toBe(false);
  });

  it("closes when tapping elsewhere on the page", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <BadgeChip badge={badge} earned />
        <span data-testid="outside">outside</span>
      </div>
    );

    await user.pointer({ keys: "[TouchA]", target: screen.getByRole("button") });
    expect(isShown(screen.getByRole("tooltip", { hidden: true }))).toBe(true);

    await user.pointer({ keys: "[TouchA]", target: screen.getByTestId("outside") });
    expect(isShown(screen.getByRole("tooltip", { hidden: true }))).toBe(false);
  });

  it("shows only one badge's details when a second badge is tapped", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <BadgeChip badge={badge} earned />
        <BadgeChip badge={other} earned />
      </div>
    );

    const [firstButton, secondButton] = screen.getAllByRole("button");
    await user.pointer({ keys: "[TouchA]", target: firstButton });
    await user.pointer({ keys: "[TouchA]", target: secondButton });

    const [firstTooltip, secondTooltip] = screen.getAllByRole("tooltip", { hidden: true });
    expect(isShown(firstTooltip)).toBe(false);
    expect(isShown(secondTooltip)).toBe(true);
  });

  it("is keyboard operable and dismisses with Escape", async () => {
    const user = userEvent.setup();
    render(<BadgeChip badge={badge} earned />);

    // Keyboard focus alone reveals the details.
    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    expect(isShown(screen.getByRole("tooltip", { hidden: true }))).toBe(true);

    await user.keyboard("{Escape}");
    expect(isShown(screen.getByRole("tooltip", { hidden: true }))).toBe(false);

    // ...and Enter toggles it back without moving focus.
    await user.keyboard("{Enter}");
    expect(isShown(screen.getByRole("tooltip", { hidden: true }))).toBe(true);
  });

  it("says so when the badge is not yet earned", async () => {
    const user = userEvent.setup();
    render(<BadgeChip badge={badge} earned={false} />);

    await user.pointer({ keys: "[TouchA]", target: screen.getByRole("button") });
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Not yet earned");
  });

  it("renders mini chips as decorative, non-interactive art", () => {
    render(<BadgeChip badge={badge} earned size="mini" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  });
});
