import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getPokemonSets } from "@/lib/sets/getPokemonSets";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Pokémon Master Set Tracker — Complete Set & Master Set Checklist",
  description:
    "Track your Pokémon master sets free. See every card in a set — dimmed until you own it — and follow Complete Set and Master Set progress, including reverse holos and secret rares.",
  alternates: { canonical: "/pokemon-master-set-tracker" },
};

const FAQS = [
  {
    q: "What is a Pokémon master set?",
    a: "A master set is the goal of owning every variant of every card in a set — not just one of each card number, but each finish: the regular card, its reverse holo, special reverse-holo patterns, and the secret rares numbered above the base set.",
  },
  {
    q: "What's the difference between a complete set and a master set?",
    a: "A Complete Set is one copy of each card number in the set. A Master Set goes further — every finish of every card. Vaultset tracks both tiers side by side so you can see how close you are to each.",
  },
  {
    q: "How do I track master set completion?",
    a: "Add your cards to Vaultset (search our Pokémon TCG database — set, number, rarity, and image auto-fill). Open any set's tracker to see every card, dimmed until you own it. Your progress bar fills in automatically as you collect, and you earn an achievement when a set is complete.",
  },
  {
    q: "Is the master set tracker free?",
    a: "Yes. Master set and complete set tracking is free for every collector, across every Pokémon set, with unlimited cards.",
  },
];

const steps = [
  { n: "01", title: "Add your cards", d: "Search the Pokémon TCG database and add cards to your collection. Set, number, rarity, finish, and image auto-fill." },
  { n: "02", title: "Open a set", d: "Every set has a tracker showing all its cards — dimmed until you own them, full-color once they're in your collection." },
  { n: "03", title: "Complete the set", d: "Watch your Complete Set and Master Set progress bars fill as you collect, filter by what you still need, and earn completion achievements." },
];

export default async function MasterSetTrackerPage() {
  const setsMap = await getPokemonSets();
  const recentSets = [...setsMap.values()]
    .filter((s) => s.releaseDate)
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""))
    .slice(0, 8);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Vaultset Master Set Tracker",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android",
        url: "https://www.vaultset.app/pokemon-master-set-tracker",
        description:
          "Free Pokémon master set tracker. Track Complete Set and Master Set completion for every Pokémon TCG set, including reverse holos and secret rares.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://www.vaultset.app" },
          { "@type": "ListItem", position: 2, name: "Master Set Tracker", item: "https://www.vaultset.app/pokemon-master-set-tracker" },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };

  return (
    <div className="space-y-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section className="space-y-6 max-w-3xl">
        <nav className="text-sm text-foreground-muted">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">Master Set Tracker</span>
        </nav>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
          Pokémon Master Set Tracker
        </h1>
        <p className="text-lg text-foreground-muted leading-relaxed">
          Track your <strong className="text-foreground">master sets</strong> and{" "}
          <strong className="text-foreground">complete sets</strong> for every Pokémon TCG set — free.
          See every card in a set, dimmed until you own it, with live progress toward completion,
          including reverse holos and secret rares.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/register" className="rounded-full bg-gold px-6 py-3 font-semibold text-background hover:bg-gold-light transition-colors">
            Start tracking free
          </Link>
          <Link href="/sets" className="rounded-full border border-border px-6 py-3 font-semibold text-foreground hover:border-gold/40 hover:bg-surface transition-colors">
            Browse every set
          </Link>
        </div>
      </section>

      {/* Complete vs Master */}
      <section className="grid sm:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Complete Set</h2>
          <p className="text-sm text-foreground-muted leading-relaxed">
            One copy of every card number in the set — including the secret rares numbered above the
            base set. The classic &ldquo;got them all&rdquo; goal.
          </p>
        </div>
        <div className="rounded-2xl border border-gold/30 bg-gold/5 p-6 space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Master Set</h2>
          <p className="text-sm text-foreground-muted leading-relaxed">
            Every finish of every card: the regular card, its reverse holo, special
            reverse-holo patterns, and holo variants. The completionist&apos;s endgame.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-8">
        <h2 className="text-3xl font-bold tracking-tight">How master set tracking works</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {steps.map(({ n, title, d }) => (
            <div key={n} className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-gold/30 bg-gold/10 text-gold font-bold">
                {n}
              </div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-foreground-muted leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Start with a set */}
      {recentSets.length > 0 && (
        <section className="space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">Start with a recent set</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {recentSets.map((s) => (
              <Link
                key={s.id}
                href={`/sets/${encodeURIComponent(s.id)}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-gold/30 hover:bg-surface-raised transition-colors"
              >
                <div className="relative h-9 w-12 shrink-0">
                  {s.images?.logo && <Image src={s.images.logo} alt={s.name} fill sizes="48px" className="object-contain" />}
                </div>
                <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
              </Link>
            ))}
          </div>
          <p className="text-sm">
            <Link href="/sets" className="text-gold hover:text-gold-light transition-colors">Browse all Pokémon sets →</Link>
          </p>
        </section>
      )}

      {/* FAQ */}
      <section className="space-y-6 max-w-3xl">
        <h2 className="text-3xl font-bold tracking-tight">Master set FAQ</h2>
        <div className="space-y-4">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group rounded-2xl border border-border bg-surface overflow-hidden">
              <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none select-none hover:bg-surface-raised transition-colors">
                <span className="font-medium text-foreground pr-4">{q}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted flex-shrink-0 transition-transform group-open:rotate-180">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <div className="px-6 pb-5 text-sm text-foreground-muted leading-relaxed border-t border-border pt-4">{a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl border border-border bg-surface p-10 text-center space-y-5">
        <h2 className="text-3xl font-bold tracking-tight">Start your master set today</h2>
        <p className="text-foreground-muted max-w-xl mx-auto">
          Free, unlimited, and works with every Pokémon TCG set. Add your cards and watch your
          collection complete itself.
        </p>
        <Link href="/register" className="inline-block rounded-full bg-gold px-8 py-3 font-semibold text-background hover:bg-gold-light transition-colors">
          Create your free account
        </Link>
      </section>
    </div>
  );
}
