import { buildOnboarding, nextStep, type OnboardingFacts } from "@/lib/onboarding";

const FRESH: OnboardingFacts = {
  hasUsername: true,
  cardCount: 0,
  wishlistCount: 0,
  pushEnabled: false,
  showcaseCount: 0,
};

describe("buildOnboarding", () => {
  it("gives a brand-new account one tick, so it never opens at zero", () => {
    const state = buildOnboarding(FRESH);

    expect(state.total).toBe(5);
    expect(state.doneCount).toBe(1);
    expect(state.complete).toBe(false);
    expect(state.steps.find((s) => s.id === "username")!.done).toBe(true);
  });

  it("marks nothing done when even the username is missing", () => {
    const state = buildOnboarding({ ...FRESH, hasUsername: false });
    expect(state.doneCount).toBe(0);
  });

  it("counts a card, a wishlist entry and a showcase pin as done", () => {
    const state = buildOnboarding({
      ...FRESH,
      cardCount: 1,
      wishlistCount: 1,
      showcaseCount: 1,
    });

    expect(state.steps.find((s) => s.id === "first_card")!.done).toBe(true);
    expect(state.steps.find((s) => s.id === "wishlist")!.done).toBe(true);
    expect(state.steps.find((s) => s.id === "showcase")!.done).toBe(true);
    expect(state.steps.find((s) => s.id === "notifications")!.done).toBe(false);
    expect(state.doneCount).toBe(4);
  });

  it("treats push as a boolean, not a count", () => {
    expect(buildOnboarding({ ...FRESH, pushEnabled: true }).steps.find((s) => s.id === "notifications")!.done)
      .toBe(true);
  });

  it("reports complete only when every step is done", () => {
    const done = buildOnboarding({
      hasUsername: true,
      cardCount: 3,
      wishlistCount: 2,
      pushEnabled: true,
      showcaseCount: 1,
    });

    expect(done.doneCount).toBe(5);
    expect(done.complete).toBe(true);
  });

  it("keeps a stable step order regardless of what's done", () => {
    // The collapsed strip names the next step, so a shifting order would make the
    // hint jump around between visits.
    const order = ["username", "first_card", "wishlist", "notifications", "showcase"];
    expect(buildOnboarding(FRESH).steps.map((s) => s.id)).toEqual(order);
    expect(buildOnboarding({ ...FRESH, showcaseCount: 9, pushEnabled: true }).steps.map((s) => s.id))
      .toEqual(order);
  });

  it("gives every step a destination and a label", () => {
    for (const step of buildOnboarding(FRESH).steps) {
      expect(step.href).toMatch(/^\//);
      expect(step.cta.length).toBeGreaterThan(0);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
  });

  it("routes the first-card step at the add page, not the inventory list", () => {
    // An empty inventory list is the wall of nothing this phase exists to replace.
    expect(buildOnboarding(FRESH).steps.find((s) => s.id === "first_card")!.href)
      .toBe("/inventory/add");
  });
});

describe("nextStep", () => {
  it("returns the first unfinished step", () => {
    expect(nextStep(buildOnboarding(FRESH))!.id).toBe("first_card");
  });

  it("skips over completed steps", () => {
    const state = buildOnboarding({ ...FRESH, cardCount: 5, wishlistCount: 1 });
    expect(nextStep(state)!.id).toBe("notifications");
  });

  it("returns null once everything is done", () => {
    const state = buildOnboarding({
      hasUsername: true,
      cardCount: 1,
      wishlistCount: 1,
      pushEnabled: true,
      showcaseCount: 1,
    });
    expect(nextStep(state)).toBeNull();
  });
});
