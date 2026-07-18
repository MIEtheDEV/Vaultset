import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getSetHubIndex } from "@/lib/hubs/hubQueries";
import { getPokemonSets } from "@/lib/sets/getPokemonSets";
import { splitSecretRares } from "@/lib/sets/setDisplay";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Pokémon TCG Sets — Card Lists, Prices & Master Set Checklists",
  description: "Browse every Pokémon TCG set on Vaultset — full card lists with live market values and prices, plus Complete Set and Master Set checklists for each set.",
  alternates: { canonical: "/sets" },
};

export default async function SetsIndexPage() {
  const [sets, meta] = await Promise.all([getSetHubIndex(), getPokemonSets()]);

  // Newest-first by release date (from the pokemontcg.io set catalog).
  const ordered = [...sets].sort((a, b) =>
    (meta.get(b.setCode)?.releaseDate ?? "").localeCompare(meta.get(a.setCode)?.releaseDate ?? ""),
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Pokémon TCG Sets",
    url: "https://www.vaultset.app/sets",
    hasPart: ordered.slice(0, 100).map((s) => ({
      "@type": "CollectionPage",
      name: meta.get(s.setCode)?.name ?? s.setName,
      url: `https://www.vaultset.app/sets/${encodeURIComponent(s.setCode)}`,
    })),
  };

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div>
        <h1 className="text-3xl font-bold text-foreground">Pokémon TCG Sets</h1>
        <p className="mt-2 text-foreground-muted max-w-2xl">
          Explore card lists and live market values for every Pokémon TCG set. Open a set to see each
          card&apos;s price, condition breakdown, and graded values — and track your Complete Set and
          Master Set completion.
        </p>
      </div>

      {ordered.length === 0 ? (
        <p className="text-sm text-foreground-muted">No sets available yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ordered.map((s) => {
            const m = meta.get(s.setCode);
            const { regular, secret } = splitSecretRares(s.count, m?.printedTotal);
            return (
              <Link
                key={s.setCode}
                href={`/sets/${encodeURIComponent(s.setCode)}`}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-gold/30 hover:bg-surface-raised transition-colors"
              >
                <div className="relative h-12 w-16 shrink-0">
                  {m?.images?.logo && (
                    <Image src={m.images.logo} alt={m.name ?? s.setName} fill sizes="64px" className="object-contain" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{m?.name ?? s.setName}</p>
                  <p className="text-xs text-foreground-muted truncate">
                    {m?.series ? `${m.series} · ` : ""}
                    {regular} cards{secret > 0 ? ` + ${secret} secret` : ""}
                    {m?.releaseDate ? ` · ${m.releaseDate.slice(0, 4)}` : ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
