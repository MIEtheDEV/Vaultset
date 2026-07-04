import Link from "next/link";
import Image from "next/image";
import type { ListedCard } from "@/lib/hubs/hubQueries";

const money = (n: number | null) => (n == null ? null : `$${Number(n).toFixed(2)}`);

// Grid of listed cards for a marketplace category hub. Tiles link to the public
// /card-data page (crawlable); buying/offers require sign-in (CTA lives on the page).
export function MarketplaceHubGrid({ cards }: { cards: ListedCard[] }) {
  return (
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
            <p className="text-xs text-foreground-muted truncate">{c.setName}{c.number ? ` · #${c.number}` : ""}</p>
            <p className="text-xs">
              {c.forSale > 0 ? (
                <span className="text-gold font-medium">{c.forSale} for sale{c.lowestAsk != null ? ` · from ${money(c.lowestAsk)}` : ""}</span>
              ) : (
                <span className="text-blue-400 font-medium">{c.forTrade} open to trade</span>
              )}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
