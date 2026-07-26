// First-run activation.
//
// A new account previously landed on four zeros, a Pro lock card where the chart
// goes, and three empty panels — the least motivating first impression the product
// could offer. There was no onboarding of any kind anywhere in the codebase.
//
// Every step is derived from data the app already stores, so this needs no new
// table: the only schema addition is `profiles.onboarding_dismissed_at`, which
// records that the checklist is finished with.
//
// Each step deliberately activates a feature that already exists but is
// under-discovered — a wishlist entry switches on price alerts and the dashboard's
// "Available Now" rail; enabling push switches on the daily digest; a showcase pin
// populates `profile_showcase`, which had a complete UI and zero rows.

import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingStepId =
  | "username"
  | "first_card"
  | "wishlist"
  | "notifications"
  | "showcase";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  /** Why it's worth doing — phrased as the benefit, not the mechanic. */
  description: string;
  done: boolean;
  cta: string;
  href: string;
};

export type OnboardingFacts = {
  hasUsername: boolean;
  cardCount: number;
  wishlistCount: number;
  pushEnabled: boolean;
  showcaseCount: number;
};

export type OnboardingState = {
  steps: OnboardingStep[];
  doneCount: number;
  total: number;
  complete: boolean;
};

export function buildOnboarding(facts: OnboardingFacts): OnboardingState {
  const steps: OnboardingStep[] = [
    {
      id: "username",
      title: "Claim your collector name",
      // Already true by the time anyone sees this — a step that starts ticked, so
      // the checklist opens with visible progress rather than five empty circles.
      description: "Your public profile is live at your username.",
      done: facts.hasUsername,
      cta: "View profile",
      href: "/dashboard",
    },
    {
      id: "first_card",
      title: "Add your first card",
      description: "Scan one with your camera, search the catalogue, or import a spreadsheet.",
      done: facts.cardCount > 0,
      cta: "Add a card",
      href: "/inventory/add",
    },
    {
      id: "wishlist",
      title: "Add a card you're hunting",
      description: "We'll tell you the moment another collector lists it, or it hits your price.",
      done: facts.wishlistCount > 0,
      cta: "Add to wishlist",
      href: "/wishlist/add",
    },
    {
      id: "notifications",
      title: "Turn on notifications",
      description: "Get a daily summary of what your collection did, plus alerts on your wishlist.",
      done: facts.pushEnabled,
      cta: "Enable",
      href: "/account",
    },
    {
      id: "showcase",
      title: "Show off your best card",
      description: "Pin cards to your profile so other collectors see them first.",
      done: facts.showcaseCount > 0,
      cta: "Pick a card",
      href: "/showcase/edit",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
  };
}

/** The first unfinished step, for the collapsed strip's "next up" hint. */
export function nextStep(state: OnboardingState): OnboardingStep | null {
  return state.steps.find((s) => !s.done) ?? null;
}

/**
 * Load the three counts the dashboard doesn't already have.
 *
 * `cardCount` is passed in because the dashboard has already summed it. All three
 * queries are `head: true` counts, and the caller skips this entirely once
 * onboarding is dismissed — so an established account pays nothing for this.
 */
export async function loadOnboardingFacts(
  supabase: SupabaseClient,
  userId: string,
  { hasUsername, cardCount }: { hasUsername: boolean; cardCount: number },
): Promise<OnboardingFacts> {
  const [{ count: wishlistCount }, { count: pushCount }, { count: showcaseCount }] =
    await Promise.all([
      supabase.from("wishlist_items").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("profile_showcase").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

  return {
    hasUsername,
    cardCount,
    wishlistCount: wishlistCount ?? 0,
    pushEnabled: (pushCount ?? 0) > 0,
    showcaseCount: showcaseCount ?? 0,
  };
}
