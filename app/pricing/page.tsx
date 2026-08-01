import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { stripe } from "@/utils/stripe";
import { UserNav } from "@/components/UserNav";
import { hasProAccess } from "@/lib/proStatus";
import { PricingCheckout, type PricePlan } from "@/components/PricingCheckout";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Upgrade to Vaultset Pro — portfolio analytics & ROI, bulk edit, bulk CSV export, on-demand pricing, and more.",
  alternates: { canonical: "/pricing" },
};

const FAQS = [
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your account settings or the billing portal at any time. Your Pro access continues until the end of the current billing period." },
  { q: "What happens when I cancel?", a: "Nothing changes right away. Your membership stays active and simply stops auto-renewing — it ends on the date it would have renewed. Every Pro feature is preserved in full until that end date, so you keep everything you paid for through the rest of the period." },
  { q: "What happens to my data if I downgrade?", a: "Nothing is deleted. You keep your full inventory, your history, and any prices you set while on Pro. Features that require Pro — portfolio analytics, CSV export, applying bulk edits, on-demand refresh, scheduled vacation mode, and showcase borders — simply become inaccessible until you resubscribe, and your portfolio chart returns to the free 7-day window." },
  { q: "What is the One-Time plan?", a: "A single payment that gives you one month of Pro access with no subscription or auto-renewal. Great if you want to try Pro without committing to a recurring plan." },
  { q: "Do you offer refunds?", a: "Subscriptions can be cancelled anytime but are not refunded for the current billing period. The One-Time plan is non-refundable." },
];

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold shrink-0">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const DASH = <span className="text-foreground-muted/40 text-sm">—</span>;

/*
  Keep this table honest — every row must match a real gate in the code:
  refresh (`/api/market-refresh` + `refreshItemMarketValue`), analytics
  (`/dashboard/analytics`), export (`/inventory/export`), bulk edit
  (`applyBulkEdit`/`undoBulkEdit`), the portfolio chart window
  (`FREE_RANGE_DAYS` in VaultPulse), showcase borders (`ShowcaseEditor`),
  scheduled vacation (`VacationModeCard`), and the marketplace set signal
  (`getListingSetSignal`). Per-card price history is public, so it is a
  free row, not a Pro one.
*/
const FEATURES: { label: string; free: React.ReactNode; pro: React.ReactNode }[] = [
  { label: "Card & sealed inventory",       free: "Unlimited",       pro: "Unlimited"      },
  { label: "Current market value",          free: CHECK,             pro: CHECK            },
  { label: "Card price history charts",     free: CHECK,             pro: CHECK            },
  { label: "Master set tracking",           free: CHECK,             pro: CHECK            },
  { label: "Buy, sell & trade",             free: CHECK,             pro: CHECK            },
  { label: "Marketplace listings",          free: "Unlimited",       pro: "Unlimited"      },
  { label: "Wishlist & price alerts",       free: CHECK,             pro: CHECK            },
  { label: "Pack reveals",                  free: CHECK,             pro: CHECK            },
  { label: "Community & storefronts",       free: CHECK,             pro: CHECK            },
  { label: "Collections",                   free: CHECK,             pro: CHECK            },
  { label: "Bulk CSV import",               free: CHECK,             pro: CHECK            },
  { label: "Listing pause",                 free: "Instant toggle",  pro: "+ Scheduled & auto-reply" },
  { label: "Market price refresh",          free: "Daily",           pro: "On-demand"      },
  { label: "Portfolio value chart",         free: "7 days",          pro: "30D / 90D / All" },
  { label: "Bulk edit (filter repricing)",  free: "Preview only",    pro: "Apply & undo"   },
  { label: "Portfolio analytics (ROI)",     free: DASH,              pro: CHECK            },
  { label: "Bulk export (tax/insurance)",   free: DASH,              pro: CHECK            },
  { label: "Collection showcase",           free: "Basic",           pro: "Advanced"       },
  { label: "Foil & gold showcase borders",  free: DASH,              pro: CHECK            },
  { label: "Set-completion signal on listings", free: DASH,          pro: CHECK            },
  { label: "Pro Seller badge *",            free: DASH,              pro: CHECK            },
];

async function fetchPlans(): Promise<PricePlan[]> {
  const keys = [
    { key: "single",     env: process.env.STRIPE_PRICE_SINGLE!     },
    { key: "monthly",    env: process.env.STRIPE_PRICE_MONTHLY!    },
    { key: "quarterly",  env: process.env.STRIPE_PRICE_QUARTERLY!  },
    { key: "semiannual", env: process.env.STRIPE_PRICE_SEMIANNUAL! },
    { key: "annual",     env: process.env.STRIPE_PRICE_ANNUAL!     },
  ];

  const prices = await Promise.all(keys.map(({ env }) => stripe.prices.retrieve(env)));

  const monthlyAmount = (prices[1].unit_amount ?? 0) / 100;

  function savings(amount: number, months: number): number {
    if (monthlyAmount === 0 || months <= 1) return 0;
    const full = monthlyAmount * months;
    return Math.round(((full - amount) / full) * 100);
  }

  const plans: PricePlan[] = [
    {
      key:         "single",
      label:       "One-Time",
      description: "One month of Pro access, no subscription or auto-renewal.",
      amount:      (prices[0].unit_amount ?? 0) / 100,
      perMonth:    0,
      period:      "one-time",
      savings:     0,
      isOneTime:   true,
      featured:    false,
    },
    {
      key:         "monthly",
      label:       "Monthly",
      description: "Pay month-to-month. Cancel anytime.",
      amount:      monthlyAmount,
      perMonth:    monthlyAmount,
      period:      "/ month",
      savings:     0,
      isOneTime:   false,
      featured:    false,
    },
    {
      key:         "quarterly",
      label:       "Quarterly",
      description: "Billed every 3 months.",
      amount:      (prices[2].unit_amount ?? 0) / 100,
      perMonth:    (prices[2].unit_amount ?? 0) / 100 / 3,
      period:      "/ quarter",
      savings:     savings((prices[2].unit_amount ?? 0) / 100, 3),
      isOneTime:   false,
      featured:    false,
    },
    {
      key:         "semiannual",
      label:       "6 Months",
      description: "Billed every 6 months.",
      amount:      (prices[3].unit_amount ?? 0) / 100,
      perMonth:    (prices[3].unit_amount ?? 0) / 100 / 6,
      period:      "/ 6 months",
      savings:     savings((prices[3].unit_amount ?? 0) / 100, 6),
      isOneTime:   false,
      featured:    false,
    },
    {
      key:         "annual",
      label:       "Annual",
      description: "Best rate for serious collectors.",
      amount:      (prices[4].unit_amount ?? 0) / 100,
      perMonth:    (prices[4].unit_amount ?? 0) / 100 / 12,
      period:      "/ year",
      savings:     savings((prices[4].unit_amount ?? 0) / 100, 12),
      isOneTime:   false,
      featured:    true,
    },
  ];

  return plans;
}

export default async function PricingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const username = user?.user_metadata?.username as string | undefined;

  let isPro = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_pro, pro_plan, pro_expires_at, pro_auto_renews")
      .eq("id", user.id)
      .single();
    // Entitlement, not the raw flag — an expired one-time payer still carries
    // `is_pro: true` and must be able to buy again (matches the checkout route,
    // which would otherwise reject the session this page just offered them).
    isPro = hasProAccess(profile as any);
  }

  const plans = await fetchPlans();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">

      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/img/icon.png" alt="Vaultset" width={28} height={28} />
            <span className="hidden md:block text-xl font-bold tracking-widest text-gold group-hover:text-gold-light transition-colors">VAULTSET</span>
          </Link>
          <div className="flex items-center gap-4">
            {username ? (
              <UserNav username={username} showSettings={false} />
            ) : (
              <>
                <Link href="/login" className="text-sm text-foreground-muted hover:text-foreground transition-colors">Sign in</Link>
                <Link href="/register" className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-background hover:bg-gold-light transition-colors">
                  Start for Free
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-24 px-6">
        <div className="mx-auto max-w-5xl space-y-20">

          {/* Hero */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
              Simple, transparent pricing
            </h1>
            <p className="text-lg text-foreground-muted max-w-xl mx-auto leading-relaxed">
              Vaultset is free to use. Pro unlocks advanced tools for collectors who want deeper analytics and no limits.
            </p>
            {isPro && (
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-sm text-gold">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                You&apos;re already on Pro
              </div>
            )}
          </div>

          {/* Plan selector + checkout */}
          <PricingCheckout plans={plans} isLoggedIn={!!user} isPro={isPro} />

          {/* Feature comparison */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-foreground text-center">What&apos;s included</h2>
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-3 px-6 py-3 border-b border-border bg-surface-raised">
                <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Feature</span>
                <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide text-center">Free</span>
                <span className="text-xs font-medium text-gold uppercase tracking-wide text-center">Pro</span>
              </div>
              {FEATURES.map(({ label, free, pro }, i) => (
                <div
                  key={label}
                  className={`grid grid-cols-3 px-6 py-3 items-center ${i !== FEATURES.length - 1 ? "border-b border-border" : ""}`}
                >
                  <span className="text-sm text-foreground">{label}</span>
                  <div className="flex justify-center text-center text-sm text-foreground-muted">{free}</div>
                  <div className="flex justify-center text-center text-sm text-foreground">{pro}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-foreground-muted text-center">
              * The Pro Seller badge is shown for recurring plans. The One-Time plan unlocks every other Pro feature.
            </p>
          </div>

          {/* FAQ */}
          <div className="max-w-2xl mx-auto space-y-6">
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
              }) }}
            />
            <h2 className="text-xl font-bold text-foreground text-center">Common questions</h2>
            {FAQS.map(({ q, a }) => (
              <div key={q} className="space-y-1.5">
                <p className="text-sm font-semibold text-foreground">{q}</p>
                <p className="text-sm text-foreground-muted leading-relaxed">{a}</p>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          {!user && (
            <div className="text-center space-y-3">
              <p className="text-foreground-muted text-sm">Start free — no credit card required.</p>
              <Link
                href="/register"
                className="inline-block rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
              >
                Create Free Account
              </Link>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
