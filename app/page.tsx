import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { UserNav } from "@/components/UserNav";
import { HeroCardStack } from "@/components/HeroCardStack";
import { KofiButton } from "@/components/KofiButton";

const features = [
  {
    title: "Smart Inventory",
    description:
      "Search our card database to auto-populate details. Track condition, quantity, and set — raw or graded (PSA, BGS, CGC, SGC).",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
        <path d="M7 8h4M7 11h2" />
        <rect x="14" y="7" width="4" height="5" rx="1" />
      </svg>
    ),
  },
  {
    title: "Market Price Tracking",
    description:
      "Pricing synced daily from TCGPlayer market data. See what you paid vs. current market value, with P&L calculated across your entire collection.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    title: "Marketplace",
    description:
      "List your cards for sale or trade and browse what the community has available. Offers and secure transactions are coming soon.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <circle cx="7" cy="7" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: "Sealed Product Tracking",
    description:
      "Log ETBs, booster boxes, and bundles. Record what you pull, track your cost-per-card, and see the P&L on every product you open.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    title: "Trade Matching",
    comingSoon: true,
    description:
      "Build a wishlist of cards you want and flag what you have for trade. Vaultset will surface matching opportunities across the community automatically.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
  },
  {
    title: "Price Alerts",
    comingSoon: true,
    description:
      "Set a target price on any card in your watchlist and get notified the moment the market hits it.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K+`;
  return n.toString();
}

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const username = user?.user_metadata?.username as string | undefined;

  const [{ data: totalCardsData }, { data: gamesData }, { count: collectors }] = await Promise.all([
    supabase.rpc("get_platform_card_count"),
    supabase.from("cards").select("game").not("game", "is", null),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  const totalCards = (totalCardsData as number) ?? 0;
  const supportedGames = new Set(gamesData?.map((r) => r.game)).size;

  const stats = [
    { value: formatCount(totalCards), label: "Cards Tracked" },
    { value: formatCount(collectors ?? 0), label: "Collectors" },
    { value: "Coming Soon", label: "Market Volume" },
    { value: formatCount(supportedGames), label: "Supported Games" },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://vaultset.app/#website",
        name: "Vaultset",
        url: "https://vaultset.app",
        description:
          "The all-in-one platform for trading card collectors. Manage inventory, track market values, buy and sell cards.",
      },
      {
        "@type": "Organization",
        "@id": "https://vaultset.app/#organization",
        name: "Vaultset",
        url: "https://vaultset.app",
        logo: {
          "@type": "ImageObject",
          url: "https://vaultset.app/img/icon.png",
        },
        description:
          "The all-in-one platform for trading card collectors. Manage inventory, track live market values, buy and sell with confidence.",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 group">
            <img src="/img/icon.png" alt="Vaultset" width={28} height={28} />
            <span className="hidden md:block text-xl font-bold tracking-widest text-gold group-hover:text-gold-light transition-colors">VAULTSET</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-foreground-muted">
            <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="/marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
            <Link href="/community" className="hover:text-foreground transition-colors">Community</Link>
          </div>
          <div className="flex items-center gap-4">
            {username ? (
              <UserNav username={username} showSettings={false} />
            ) : (
              <>
                <Link href="/login" className="hidden sm:block text-sm text-foreground-muted hover:text-foreground transition-colors">
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
                >
                  Start for Free
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-surface to-background" />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(ellipse, rgba(232,184,75,0.06) 0%, transparent 70%)" }}
        />

        <div className="relative mx-auto max-w-7xl px-6 py-24 grid lg:grid-cols-2 gap-16 items-center w-full">
          {/* Text */}
          <div className="flex flex-col gap-8">
            <div className="spin-border inline-flex w-fit items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-1.5 text-sm text-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Now in Early Access
            </div>
            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-balance leading-[1.1]">
              Your Collection,{" "}
              <span className="text-gold">Elevated.</span>
            </h1>
            <p className="text-lg text-foreground-muted leading-relaxed max-w-lg">
              The all-in-one platform for trading card collectors. Manage your
              inventory, track live market values, buy and sell with confidence,
              and connect with a passionate community.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/register"
                className="rounded-full bg-gold px-6 py-3 font-semibold text-background hover:bg-gold-light transition-colors"
              >
                Start for Free
              </Link>
              <Link
                href="#features"
                className="rounded-full border border-border px-6 py-3 font-semibold text-foreground hover:border-gold/40 hover:bg-surface transition-colors"
              >
                Explore Features
              </Link>
            </div>
            <p className="text-sm text-foreground-muted">
              No credit card required. Core features always free.
            </p>
          </div>

          {/* Decorative card stack */}
          <HeroCardStack />
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map(({ value, label }) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex items-center justify-center h-10">
                <span className={`font-bold text-gold ${value === "Coming Soon" ? "text-lg" : "text-3xl"}`}>{value}</span>
              </div>
              <span className="text-sm text-foreground-muted">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">
              Everything your collection deserves
            </h2>
            <p className="text-foreground-muted text-lg max-w-2xl mx-auto">
              From the moment you add your first card to the day you make the
              perfect trade, Vaultset has you covered.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon, title, description, comingSoon }) => (
              <div
                key={title}
                className="group rounded-2xl border border-border bg-surface p-6 hover:border-gold/30 hover:bg-surface-raised transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-3 sm:flex-col sm:items-start sm:gap-0 sm:mb-0">
                  <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold group-hover:bg-gold/15 transition-colors sm:mb-4">
                    {icon}
                  </div>
                  <div className="flex items-center gap-2 sm:mb-2">
                    <h3 className="font-semibold text-foreground">{title}</h3>
                    {comingSoon && (
                      <span className="inline-flex items-center rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs font-medium text-gold">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-24 border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">
              Ready to open the vault?
            </h2>
            <p className="text-foreground-muted text-lg max-w-xl mx-auto">
              Join collectors who manage, track, and grow their collections on
              Vaultset — free, forever.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="rounded-full bg-gold px-8 py-3 font-semibold text-background hover:bg-gold-light transition-colors"
            >
              Create Free Account
            </Link>
            <Link
              href="/marketplace"
              className="rounded-full border border-border px-8 py-3 font-semibold text-foreground hover:border-gold/40 hover:bg-surface-raised transition-colors"
            >
              Browse the Market
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-lg font-bold tracking-widest text-gold">VAULTSET</span>
          <KofiButton />
          <div className="flex gap-6 text-sm text-foreground-muted">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
