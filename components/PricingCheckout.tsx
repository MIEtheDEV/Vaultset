"use client";

import { useState } from "react";
import Link from "next/link";

export type PricePlan = {
  key:               string;
  label:             string;
  description:       string;
  amount:            number;   // dollars
  perMonth:          number;   // dollars, for display
  period:            string;   // e.g. "/ month", "/ year"
  savings:           number;   // percent vs monthly, 0 if n/a
  isOneTime:         boolean;
  featured:          boolean;
};

export function PricingCheckout({
  plans,
  isLoggedIn,
  isPro,
}: {
  plans:       PricePlan[];
  isLoggedIn:  boolean;
  isPro:       boolean;
}) {
  const defaultPlan = plans.find((p) => p.featured)?.key ?? plans[0]?.key ?? "";
  const [selected, setSelected] = useState(defaultPlan);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleCheckout() {
    if (!isLoggedIn) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/stripe/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan: selected }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePortal() {
    setLoading(true);
    try {
      const res  = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {plans.map((plan) => {
          const isSelected = selected === plan.key;
          return (
            <button
              key={plan.key}
              type="button"
              onClick={() => !isPro && setSelected(plan.key)}
              className={`relative rounded-2xl border p-5 text-left transition-all flex flex-col gap-3 ${
                plan.featured && !isPro
                  ? isSelected
                    ? "border-gold bg-gold/10 ring-1 ring-gold/40"
                    : "border-gold/40 bg-gold/5 hover:border-gold/70"
                  : isSelected
                    ? "border-gold bg-surface-raised ring-1 ring-gold/30"
                    : "border-border bg-surface hover:border-gold/30"
              } ${isPro ? "cursor-default opacity-60" : "cursor-pointer"}`}
            >
              {plan.featured && !isPro && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-background">
                  Best Value
                </span>
              )}

              <div>
                <p className="text-sm font-semibold text-foreground">{plan.label}</p>
                <p className="text-xs text-foreground-muted mt-0.5 leading-snug">{plan.description}</p>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-foreground">${plan.amount.toFixed(2)}</span>
                  <span className="text-xs text-foreground-muted">{plan.period}</span>
                </div>
                {!plan.isOneTime && plan.perMonth !== plan.amount && (
                  <p className="text-xs text-foreground-muted mt-0.5">
                    ${plan.perMonth.toFixed(2)} / mo
                  </p>
                )}
              </div>

              {plan.savings > 0 && (
                <span className="self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  Save {plan.savings}%
                </span>
              )}

              {isSelected && !isPro && (
                <div className="absolute top-3 right-3 h-4 w-4 rounded-full bg-gold flex items-center justify-center">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-background">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3">
        {isPro ? (
          <button
            type="button"
            onClick={handlePortal}
            disabled={loading}
            className="rounded-full border border-border px-8 py-3 text-sm font-semibold text-foreground hover:border-gold/40 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading…" : "Manage Subscription"}
          </button>
        ) : isLoggedIn ? (
          <button
            type="button"
            onClick={handleCheckout}
            disabled={loading}
            className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light transition-colors disabled:opacity-50"
          >
            {loading ? "Loading…" : "Upgrade to Pro"}
          </button>
        ) : (
          <Link
            href="/register"
            className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
          >
            Get Started Free
          </Link>
        )}
        {!isPro && !isLoggedIn && (
          <p className="text-xs text-foreground-muted">
            Free account required.{" "}
            <Link href="/login" className="text-gold hover:text-gold-light transition-colors">
              Already have one?
            </Link>
          </p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

    </div>
  );
}
