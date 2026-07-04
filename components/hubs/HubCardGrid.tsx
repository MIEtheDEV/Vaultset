import Link from "next/link";
import Image from "next/image";
import type { CatalogCard } from "@/lib/hubs/hubQueries";

const money = (n: number | null) => (n == null ? null : `$${Number(n).toFixed(2)}`);

// Shared grid of catalog cards → their /card-data pages. Emits ItemList JSON-LD
// (top items) so the hub is eligible for list rich results, and is a dense
// internal-link block pointing at the card-data pages.
export function HubCardGrid({ cards, showSet = false }: { cards: CatalogCard[]; showSet?: boolean }) {
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: cards.length,
    itemListElement: cards.slice(0, 50).map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://vaultset.app/card-data/${encodeURIComponent(c.apiId)}`,
      name: c.name,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Link
            key={c.apiId}
            href={`/card-data/${encodeURIComponent(c.apiId)}`}
            className="group rounded-2xl border border-border bg-surface overflow-hidden hover:border-gold/30 hover:bg-surface-raised transition-colors"
          >
            <div className="relative aspect-[2.5/3.5] w-full bg-surface-raised">
              {c.image ? (
                <Image src={c.image} alt={c.name} fill sizes="(max-width:640px) 50vw, 20vw" className="object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                </div>
              )}
            </div>
            <div className="p-3 space-y-0.5">
              <p className="text-sm font-medium text-foreground truncate group-hover:text-gold transition-colors">{c.name}</p>
              <p className="text-xs text-foreground-muted truncate">
                {showSet ? c.setName : ""}{showSet && c.number ? " · " : ""}{c.number ? `#${c.number}` : ""}
              </p>
              {money(c.value) && <p className="text-sm font-semibold text-gold">{money(c.value)}</p>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
