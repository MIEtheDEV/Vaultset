"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/components/ui/Toast";
import { nextStep, type OnboardingState } from "@/lib/onboarding";

/**
 * The first thing a new account sees, in place of a wall of zeros.
 *
 * Two shapes: expanded while there's real setup left, and a one-line strip once
 * the user is underway, so it stops competing with their actual collection. Either
 * way it can be dismissed for good.
 */
export function OnboardingChecklist({ state }: { state: OnboardingState }) {
  const router = useRouter();
  const [dismissing, setDismissing] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Expanded while there's more to do than the freebie username tick; a strip once
  // the user has genuinely started.
  const [expanded, setExpanded] = useState(state.doneCount <= 1);

  const next = nextStep(state);
  const pct = Math.round((state.doneCount / state.total) * 100);

  async function dismiss() {
    setDismissing(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_dismissed_at: new Date().toISOString() })
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");

    if (error) {
      setDismissing(false);
      toast.error("Couldn't hide the checklist", { description: error.message });
      return;
    }

    setHidden(true);
    toast.success("Checklist hidden", { description: "You can still find everything from the nav." });
    router.refresh();
  }

  if (hidden) return null;

  return (
    <section className="rise-in rounded-2xl border border-gold/25 bg-gold/[0.04] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">
            {state.complete ? "You're all set" : "Get your vault started"}
          </h2>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {state.complete
              ? "Everything's switched on. Nice work."
              : next
                ? `Next: ${next.title.toLowerCase()}`
                : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs font-medium tabular-nums text-gold">
            {state.doneCount}/{state.total}
          </span>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-foreground-muted transition-colors hover:text-foreground"
            >
              Show
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            aria-label="Hide setup checklist"
            title="Hide for good"
            className="flex h-6 w-6 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full rounded-full bg-gold"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Setup ${pct}% complete`}
        />
      </div>

      {expanded && (
        <>
          <ol className="mt-4 divide-y divide-border/60">
            {state.steps.map((step) => (
              <li key={step.id} className="flex items-start gap-3 py-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    step.done
                      ? "border-gold bg-gold text-background"
                      : "border-border text-transparent"
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${step.done ? "text-foreground-muted line-through decoration-1" : "text-foreground"}`}>
                    {step.title}
                  </p>
                  {!step.done && (
                    <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">
                      {step.description}
                    </p>
                  )}
                </div>

                {!step.done && (
                  <Link
                    href={step.href}
                    className="shrink-0 rounded-full border border-gold/40 px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold hover:text-background"
                  >
                    {step.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>

          {/*
            The strongest switching path for anyone arriving from a spreadsheet, and
            previously buried behind a header button on the inventory page.
          */}
          {state.steps.find((s) => s.id === "first_card")?.done === false && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-3 text-xs text-foreground-muted">
              <span>Already track your collection in a spreadsheet?</span>
              <Link href="/inventory/import" className="font-medium text-gold hover:underline">
                Import a CSV instead →
              </Link>
            </div>
          )}

          {state.doneCount > 1 && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-3 text-xs text-foreground-muted transition-colors hover:text-foreground"
            >
              Collapse
            </button>
          )}
        </>
      )}
    </section>
  );
}
