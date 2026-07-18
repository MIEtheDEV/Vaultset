import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { UserNav } from "@/components/UserNav";
import { HeroCardStack } from "@/components/HeroCardStack";
import { RotatingHeadline } from "@/components/RotatingHeadline";
import { InstallAppButton } from "@/components/InstallAppButton";
import { InstallPwaCallout } from "@/components/InstallPwaCallout";
import { HomeMobileNav } from "@/components/HomeMobileNav";
import { CardSearchBrowser } from "@/components/CardSearchBrowser";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const features: { title: string; description: string; icon: ReactNode; install?: boolean }[] = [
  {
    title: "Smart Inventory",
    description: "Search the Pokémon TCG database to auto-populate card details. Track condition, quantity, finish, and set — raw or graded (PSA, BGS, CGC, SGC).",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /><path d="M7 8h4M7 11h2" /><rect x="14" y="7" width="4" height="5" rx="1" /></svg>),
  },
  {
    title: "Master Set Tracker",
    description: "See every card in a set — dimmed until you own it, full-color once you do. Track Complete Set (one of each card) and Master Set (every finish, including reverse holos and secret rares), with live progress bars and completion achievements.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16M3 12h18" /></svg>),
  },
  {
    title: "Live Market Prices",
    description: "TCGPlayer market data synced daily. See exactly what you paid vs. current market value, with P&L calculated across every card in your vault.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>),
  },
  {
    title: "Buy, Sell & Trade",
    description: "List cards for sale or trade, browse the community market, and send cash, trade, or counter-offers. Both parties confirm receipt before a deal closes.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1" fill="currentColor" /></svg>),
  },
  {
    title: "Sealed Product Tracking",
    description: "Log ETBs, booster boxes, and bundles. Record your pulls, track cost-per-card, and see the P&L on every product you open.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>),
  },
  {
    title: "Trade Matching",
    description: "Build a wishlist of cards you want and flag what you have for trade. Vaultset automatically surfaces matching opportunities across the community.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>),
  },
  {
    title: "Pack Reveals",
    description: "Log your pulls from any sealed product and share them with the community. See what other collectors are opening in real time.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 3 12 15" /><path d="M5 9l7-7 7 7" /><rect x="2" y="15" width="20" height="6" rx="2" /></svg>),
  },
  {
    title: "Price Alerts",
    description: "Set a target price on any card in your wishlist and get notified the moment a listing drops to meet it.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>),
  },
  {
    title: "Push Notifications",
    description: "Get real-time alerts for offers, messages, price drops, and wishlist matches — even when Vaultset is closed. Install the app to turn them on.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5" /><line x1="10" y1="18" x2="14" y2="18" /><circle cx="18" cy="5" r="2.5" fill="currentColor" stroke="none" /></svg>),
    install: true,
  },
  {
    title: "Collector Community",
    description: "Follow other collectors, browse their storefronts, and see what they're listing. A real community built around the hobby.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>),
  },
  {
    title: "Collections",
    description: "Track set completion and rarity hunts. Collections live on your profile and let other collectors see what you're chasing.",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="18" rx="2" /><rect x="8" y="1" width="14" height="18" rx="2" /></svg>),
  },
];

const faqs: { q: string; a: string; link?: { href: string; label: string }; install?: boolean }[] = [
  {
    q: "How do I track my Pokémon card collection?",
    a: "Create a free Vaultset account, then add cards by searching our Pokémon TCG database. Card details like set, number, rarity, and image auto-populate. You can track condition, finish, grading info, quantity, and what you paid.",
  },
  {
    q: "How do I know what my Pokémon card collection is worth?",
    a: "Vaultset syncs TCGPlayer market prices daily. Your dashboard shows total collection value, individual card market prices, and P&L against what you paid — all updated automatically.",
  },
  {
    q: "What is a Pokémon master set?",
    a: "A master set is the goal of owning every variant of every card in a set — not just one of each card number, but each finish too: the regular card, its reverse holo, special reverse-holo patterns, and the secret rares numbered above the base set. It's a step beyond a \"complete set\" (one of each card). Vaultset tracks both tiers per set.",
  },
  {
    q: "Can I track master set completion on Vaultset?",
    a: "Yes. Every Pokémon set has a dedicated page showing all of its cards — dimmed until you own them, full-color once they're in your collection. A live progress bar tracks both Complete Set (one of each card) and Master Set (every finish), and you earn achievements when you finish a set. As you add cards to your inventory, the checklist fills in automatically.",
    link: { href: "/pokemon-master-set-tracker", label: "Learn about master set tracking" },
  },
  {
    q: "Can I buy and sell Pokémon cards on Vaultset?",
    a: "Yes. List any card in your inventory for sale, set your price, and other collectors can send you cash offers. The deal closes only after both parties confirm receipt.",
  },
  {
    q: "Is Vaultset free?",
    a: "Yes — all the essentials are free, including unlimited inventory with current market values, the full marketplace with unlimited listings (buy, sell, trade, and counter-offers), price alerts, pack reveals, bulk CSV import, collections, wishlist, and the whole community. A Pro plan unlocks advanced tools for serious collectors — portfolio price-history charts, the detailed P&L / ROI analytics report, advanced collection showcase with foil &amp; holo card borders, on-demand price refreshes, scheduled vacation mode, a Pro Seller badge, and bulk CSV export.",
    link: { href: "/pricing", label: "Compare Free & Pro plans" },
  },
  {
    q: "Does Vaultset support graded cards?",
    a: "Yes. You can log PSA, BGS, CGC, and SGC grades with cert numbers. Graded cards show their grade on your profile and in marketplace listings.",
  },
  {
    q: "Is Vaultset available as an app?",
    a: "Vaultset isn't on the Apple App Store or Google Play, but you can install it as an app straight from your browser — it's a Progressive Web App (PWA), free and ready in seconds. On Android or desktop Chrome/Edge, tap \"Install app\" in the top bar (or your browser menu → Install). On iPhone or iPad, open Vaultset in Safari, tap the Share button, then \"Add to Home Screen.\" Once installed it launches full-screen from your home screen like a native app, loads fast, and can deliver push notifications for offers and price alerts — with no download or app-store account required.",
    install: true,
  },
  {
    q: "What trading card games does Vaultset support?",
    a: "Pokémon TCG is fully supported today, with live market prices and the complete card database. Support for MTG, One Piece, and Lorcana is on the roadmap.",
  },
];

const steps = [
  {
    number: "01",
    title: "Add your cards",
    description: "Search the Pokémon TCG database and add cards to your vault in seconds. Condition, rarity, set, and card image auto-fill.",
  },
  {
    number: "02",
    title: "Track your value",
    description: "TCGPlayer market prices sync daily. Your dashboard shows what your collection is worth right now — and how it compares to what you paid.",
  },
  {
    number: "03",
    title: "Buy, sell, and trade",
    description: "List cards for sale or trade. Send and receive offers directly with other collectors. No fees, no middleman.",
  },
];

function StarBar({ average, count }: { average: number; count: number }) {
  const pct = (average / 5) * 100;
  return (
    <div className="flex items-center gap-3">
      {/* Star track */}
      <div className="relative inline-flex text-2xl leading-none select-none">
        {/* Empty stars */}
        <span className="text-border">{"★★★★★"}</span>
        {/* Filled stars clipped to average */}
        <span
          className="absolute inset-0 overflow-hidden text-gold"
          style={{ width: `${pct}%` }}
        >
          {"★★★★★"}
        </span>
      </div>
      <div>
        <span className="text-lg font-bold text-foreground">{average.toFixed(1)}</span>
        <span className="text-sm text-foreground-muted ml-1.5">out of 5 · {count} review{count !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K+`;
  return n.toString();
}

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const username = user?.user_metadata?.username as string | undefined;

  // Whether this user has already installed the PWA — suppresses install prompts.
  let pwaInstalled = false;
  if (user) {
    const { data: installProfile } = await supabase
      .from("profiles")
      .select("pwa_installed_at")
      .eq("id", user.id)
      .single();
    pwaInstalled = Boolean(installProfile?.pwa_installed_at);
  }

  const [
    { data: totalCardsData },
    { data: gamesData },
    { count: collectors },
    { data: marketValueData },
    { data: reviewsData },
  ] = await Promise.all([
    supabase.rpc("get_platform_card_count"),
    supabase.from("cards").select("game").not("game", "is", null),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.rpc("get_platform_market_value"),
    supabase.from("reviews").select("id, rating, body, display_name, pinned").eq("approved", true).order("pinned", { ascending: false }).order("created_at", { ascending: false }),
  ]);

  const totalCards     = (totalCardsData as number) ?? 0;
  const supportedGames = new Set(gamesData?.map((r) => r.game)).size;
  const marketVolume   = (marketValueData as number) ?? 0;
  const allReviews     = reviewsData ?? [];
  const reviews        = allReviews.slice(0, 3);
  const reviewCount    = allReviews.length;
  const reviewAverage  = reviewCount > 0
    ? allReviews.reduce((sum, r) => sum + (r.rating as number), 0) / reviewCount
    : 0;

  function formatCurrency(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return `$${n.toFixed(0)}`;
  }

  const stats = [
    { value: formatCount(totalCards),       label: "Cards Tracked" },
    { value: formatCount(collectors ?? 0),  label: "Collectors" },
    { value: formatCurrency(marketVolume),  label: "Market Value" },
    { value: formatCount(supportedGames),   label: "Supported Games" },
  ];

  const siteDescription =
    "The free Pokémon TCG collection tracker, card inventory manager, and master set tracker. Track your cards, monitor live market prices, complete your master sets, and buy, sell, and trade with other collectors.";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://www.vaultset.app/#website",
        name: "Vaultset",
        url: "https://www.vaultset.app",
        description: siteDescription,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://www.vaultset.app/card-data?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": "https://www.vaultset.app/#organization",
        name: "Vaultset",
        url: "https://www.vaultset.app",
        logo: { "@type": "ImageObject", url: "https://www.vaultset.app/img/icon.png" },
        description: siteDescription,
        sameAs: ["https://twitter.com/vaultsetapp"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://www.vaultset.app/#app",
        name: "Vaultset",
        url: "https://www.vaultset.app",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android",
        description: siteDescription,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          "Pokémon card collection tracker",
          "Card inventory management (raw and graded)",
          "Master set and complete set tracking",
          "Live TCGPlayer market prices and portfolio value",
          "Collector marketplace — buy, sell, and trade",
          "Trade matching and wishlist",
          "Sealed product and pack-reveal tracking",
        ],
        ...(reviewCount > 0
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: reviewAverage.toFixed(1),
                reviewCount,
              },
            }
          : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
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
          <div className="hidden min-[1200px]:flex items-center gap-8 text-sm text-foreground-muted">
            <Link href="#how-it-works" className="hover:text-foreground transition-colors">How it works</Link>
            <Link href="#master-sets" className="hover:text-foreground transition-colors">Master Sets</Link>
            <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="#card-search" className="hover:text-foreground transition-colors">Card Search</Link>
            {/* Marketplace & Community require an account; show them only to signed-in users on the homepage. */}
            {username && (
              <>
                <Link href="/marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
                <Link href="/community" className="hover:text-foreground transition-colors">Community</Link>
              </>
            )}
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-4">
            <InstallAppButton serverInstalled={pwaInstalled} />
            {username ? (
              <UserNav username={username} showSettings={false} signOutInMenu usernameHref="/dashboard" />
            ) : (
              <>
                <Link href="/login" className="text-sm text-foreground-muted hover:text-foreground transition-colors">
                  Sign in
                </Link>
                <Link href="/register" className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-background hover:bg-gold-light transition-colors">
                  Start for Free
                </Link>
              </>
            )}
            <HomeMobileNav loggedIn={!!username} />
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

        <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-16 items-center w-full">
          <div className="flex flex-col gap-5 sm:gap-8">
            <div className="spin-border inline-flex w-fit items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-1.5 text-sm text-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Now in Early Access — Free to Join
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.15]">
              Track, value &amp; trade your Pokémon card collection
            </h1>

            <div className="text-lg sm:text-xl font-medium text-gold/90 leading-snug min-h-[1.75rem]">
              <RotatingHeadline />
            </div>

            <p className="text-lg text-foreground-muted leading-relaxed max-w-lg">
              Vaultset is the free Pokémon TCG collection tracker, card inventory manager,
              and marketplace built for serious collectors. Track every card, monitor live
              market prices, complete your master sets, and buy, sell, and trade directly
              with other collectors — all in one place.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link href="/register" className="rounded-full bg-gold px-6 py-3 font-semibold text-background hover:bg-gold-light transition-colors">
                Start for Free
              </Link>
              <Link href="#how-it-works" className="rounded-full border border-border px-6 py-3 font-semibold text-foreground hover:border-gold/40 hover:bg-surface transition-colors">
                See How It Works
              </Link>
            </div>
            <p className="text-sm text-foreground-muted">
              No credit card required · Core features always free
            </p>
          </div>

          <HeroCardStack />
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map(({ value, label }) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex items-center justify-center h-10">
                <span className="text-3xl font-bold text-gold">{value}</span>
              </div>
              <span className="text-sm text-foreground-muted">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Install as a PWA */}
      <div className="mx-auto max-w-7xl px-6">
        <InstallPwaCallout className="my-12" serverInstalled={pwaInstalled} />
      </div>

      {/* Card Search */}
      <section id="card-search" className="py-20 sm:py-28 border-t border-border scroll-mt-16">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-10 space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">Look up any card</h2>
            <p className="text-foreground-muted text-lg max-w-xl mx-auto">
              Search the full Pokémon TCG catalog for live market value, price history, and
              what&apos;s available — even cards no one has added yet.
            </p>
          </div>
          <CardSearchBrowser loggedIn={!!username} />
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">Up and running in minutes</h2>
            <p className="text-foreground-muted text-lg max-w-xl mx-auto">
              No spreadsheets. No manual data entry. Just your collection, organized.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8 relative">
            <div className="hidden sm:block absolute top-8 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px border-t border-dashed border-border" />
            {steps.map(({ number, title, description }) => (
              <div key={number} className="flex flex-col items-center text-center gap-4">
                <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold/30 bg-gold/10 text-gold font-bold text-lg">
                  {number}
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground text-lg">{title}</h3>
                  <p className="text-sm text-foreground-muted leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Master Sets spotlight */}
      <section id="master-sets" className="relative py-28 border-t border-border bg-surface overflow-hidden scroll-mt-16">
        <div
          className="absolute top-0 right-0 w-[700px] h-[500px] rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(232,184,75,0.07) 0%, transparent 70%)" }}
        />
        <div className="relative mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-3 py-1 text-xs font-medium text-gold">
              Master Set Tracker
            </span>
            <h2 className="text-4xl font-bold tracking-tight leading-tight">
              Complete your master sets
            </h2>
            <p className="text-foreground-muted text-lg leading-relaxed">
              Open any Pokémon set and see every card at once — dimmed until you own it, full-color
              once it&apos;s in your collection. As you add cards, your checklist fills in
              automatically and a live progress bar tracks how close you are.
            </p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="mt-1 text-gold" aria-hidden>✓</span>
                <span className="text-sm text-foreground-muted"><span className="text-foreground font-medium">Complete Set</span> — one of every card, including the secret rares numbered above the base set.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 text-gold" aria-hidden>✓</span>
                <span className="text-sm text-foreground-muted"><span className="text-foreground font-medium">Master Set</span> — every finish of every card: normal, reverse holo, and special holo variants.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 text-gold" aria-hidden>✓</span>
                <span className="text-sm text-foreground-muted">Earn <span className="text-foreground font-medium">achievements</span> when you complete a set, and filter by needed, captured, or rarity.</span>
              </li>
            </ul>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link href="/register" className="rounded-full bg-gold px-6 py-3 font-semibold text-background hover:bg-gold-light transition-colors">
                Start tracking free
              </Link>
              <Link href="/sets" className="rounded-full border border-border px-6 py-3 font-semibold text-foreground hover:border-gold/40 hover:bg-surface-raised transition-colors">
                Browse every set
              </Link>
            </div>
          </div>

          {/* Visual mockup: dimmed → bright checklist grid with a progress bar */}
          <div className="rounded-2xl border border-border bg-surface-raised p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">Surging Sparks</span>
              <span className="text-xs text-foreground-muted tabular-nums">142 / 252 · 56%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-background mb-5">
              <div className="h-full rounded-full bg-gold" style={{ width: "56%" }} />
            </div>
            <div className="grid grid-cols-4 gap-2.5" aria-hidden>
              {[1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0].map((owned, i) => (
                <div
                  key={i}
                  className={`relative aspect-[2.5/3.5] rounded-lg border ${
                    owned ? "border-gold/40 bg-gold/10" : "border-border bg-background opacity-40"
                  }`}
                >
                  {owned === 1 && (
                    <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gold text-background text-[8px] font-bold">✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-28 border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">
              Everything your Pokémon TCG collection deserves
            </h2>
            <p className="text-foreground-muted text-lg max-w-2xl mx-auto">
              From the moment you add your first card to the day you make the perfect trade.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(({ icon, title, description, install }) => (
              <div key={title} className="group rounded-2xl border border-border bg-surface p-6 hover:border-gold/30 hover:bg-surface-raised transition-all duration-200">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold group-hover:bg-gold/15 transition-colors mb-4">
                  {icon}
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-foreground-muted leading-relaxed">{description}</p>
                {install && (
                  <div className="mt-4">
                    <InstallAppButton variant="inline" serverInstalled={pwaInstalled} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:text-gold-light transition-colors">
              Compare Free &amp; Pro plans
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">Why not just use a spreadsheet?</h2>
            <p className="text-foreground-muted text-lg max-w-xl mx-auto">
              Spreadsheets track what you own. Vaultset tells you what it&apos;s worth, finds you trades, and connects you to buyers.
            </p>
          </div>
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-raised">
                  <th className="text-left px-3 sm:px-6 py-3 sm:py-4 text-foreground font-semibold">Feature</th>
                  <th className="px-2 sm:px-6 py-3 sm:py-4 text-center text-gold font-semibold">Vaultset</th>
                  <th className="px-2 sm:px-6 py-3 sm:py-4 text-center text-foreground-muted font-medium">
                    <span className="sm:hidden">Sheet</span>
                    <span className="hidden sm:inline">Spreadsheet</span>
                  </th>
                  <th className="px-2 sm:px-6 py-3 sm:py-4 text-center text-foreground-muted font-medium">
                    <span className="sm:hidden">Others</span>
                    <span className="hidden sm:inline">Other apps</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["Live market prices",    true,  false, "Partial"],
                  ["Master set tracking",   true,  false, "Partial"],
                  ["Built-in marketplace",  true,  false, false],
                  ["Trade matching",        true,  false, false],
                  ["Pack reveal sharing",   true,  false, false],
                  ["Price alerts",          true,  false, "Paid only"],
                  ["Free to use",           true,  true,  false],
                ].map(([label, vaultset, sheet, other]) => (
                  <tr key={label as string} className="hover:bg-surface-raised transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-3.5 text-foreground">{label as string}</td>
                    <td className="px-2 sm:px-6 py-3 sm:py-3.5 text-center">
                      {vaultset === true ? <span className="text-emerald-400 font-bold">✓</span> : <span className="text-foreground-muted">—</span>}
                    </td>
                    <td className="px-2 sm:px-6 py-3 sm:py-3.5 text-center">
                      {sheet === true ? <span className="text-emerald-400 font-bold">✓</span> : sheet === false ? <span className="text-red-400">✗</span> : <span className="text-foreground-muted text-xs">{sheet}</span>}
                    </td>
                    <td className="px-2 sm:px-6 py-3 sm:py-3.5 text-center">
                      {other === true ? <span className="text-emerald-400 font-bold">✓</span> : other === false ? <span className="text-red-400">✗</span> : <span className="text-foreground-muted text-xs">{other}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="py-28 border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">What collectors are saying</h2>
            {reviewCount > 0 && (
              <div className="flex justify-center">
                <StarBar average={reviewAverage} count={reviewCount} />
              </div>
            )}
          </div>

          {reviews.length > 0 ? (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {reviews.map((review) => (
                  <div key={review.id} className="rounded-2xl border border-border bg-surface p-6 space-y-3">
                    <div className="text-gold text-lg">
                      {"★".repeat(review.rating as number)}{"☆".repeat(5 - (review.rating as number))}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">&ldquo;{review.body as string}&rdquo;</p>
                    <p className="text-xs text-foreground-muted font-medium">
                      — {(review.display_name as string) ?? "Vaultset collector"}
                      <span className="ml-1.5 text-gold text-xs">Verified collector</span>
                    </p>
                  </div>
                ))}
              </div>
              {reviewCount > 3 && (
                <div className="text-center mt-8">
                  <Link href="/reviews" className="text-sm text-gold hover:underline transition-colors">
                    Read all {reviewCount} reviews →
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 space-y-4">
              <p className="text-foreground-muted text-lg">No reviews yet — be the first.</p>
              {user ? (
                <Link href="/account" className="inline-block rounded-full border border-gold/40 px-6 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10 transition-colors">
                  Leave a Review
                </Link>
              ) : (
                <Link href="/register" className="inline-block rounded-full border border-gold/40 px-6 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10 transition-colors">
                  Join &amp; Leave a Review
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-28 border-t border-border">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">Frequently asked questions</h2>
          </div>
          <div className="space-y-4">
            {faqs.map(({ q, a, link, install }) => (
              <details key={q} className="group rounded-2xl border border-border bg-surface overflow-hidden">
                <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none select-none hover:bg-surface-raised transition-colors">
                  <span className="font-medium text-foreground pr-4">{q}</span>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    className="text-foreground-muted flex-shrink-0 transition-transform group-open:rotate-180"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <div className="px-6 pb-5 text-sm text-foreground-muted leading-relaxed border-t border-border pt-4">
                  {a}
                  {install && (
                    <div className="mt-4">
                      <InstallAppButton variant="inline" serverInstalled={pwaInstalled} />
                    </div>
                  )}
                  {link && (
                    <div className="mt-3">
                      <Link href={link.href} className="inline-flex items-center gap-1.5 font-semibold text-gold hover:text-gold-light transition-colors">
                        {link.label}
                        <span aria-hidden>→</span>
                      </Link>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">Ready to open the vault?</h2>
            <p className="text-foreground-muted text-lg max-w-xl mx-auto">
              Join collectors who manage, track, and grow their Pokémon TCG collections on Vaultset — free, forever.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/register" className="rounded-full bg-gold px-8 py-3 font-semibold text-background hover:bg-gold-light transition-colors">
              Create Free Account
            </Link>
            <Link href="/pricing" className="rounded-full border border-border px-8 py-3 font-semibold text-foreground hover:border-gold/40 hover:bg-surface-raised transition-colors">
              View Pricing
            </Link>
            <Link href="/marketplace" className="rounded-full border border-border px-8 py-3 font-semibold text-foreground hover:border-gold/40 hover:bg-surface-raised transition-colors">
              Browse the Market
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
