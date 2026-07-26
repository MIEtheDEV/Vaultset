import Link from "next/link";
import Image from "next/image";
import { DailyChange } from "@/components/DailyChange";
import type { Mover } from "@/lib/vaultDaily";

/**
 * The cards in your vault that moved most today.
 *
 * Deliberately shows losers alongside gainers. A collection tracker that only
 * ever reports good news isn't a tracker, and the down list is what makes the
 * number feel trustworthy enough to come back to.
 *
 * Renders nothing when there's nothing to say, so the dashboard doesn't grow an
 * empty panel for users whose cards haven't been priced yet.
 */
export function TodaysMovers({ up, down }: { up: Mover[]; down: Mover[] }) {
  if (up.length === 0 && down.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold text-foreground">Today&apos;s Movers</h2>
        <Link href="/inventory" className="text-xs text-foreground-muted hover:text-foreground transition-colors">
          View vault →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MoverColumn label="Gainers" movers={up} emptyLabel="No gains recorded today." />
        <MoverColumn label="Decliners" movers={down} emptyLabel="No declines recorded today." />
      </div>
    </section>
  );
}

function MoverColumn({
  label,
  movers,
  emptyLabel,
}: {
  label: string;
  movers: Mover[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <p className="border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </p>

      {movers.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-foreground-muted">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border">
          {movers.map((m) => (
            <li key={m.itemId}>
              <Link
                href={`/inventory/${m.itemId}/edit`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised transition-colors"
              >
                {m.imageUrl ? (
                  <Image
                    src={m.imageUrl}
                    alt={m.name}
                    width={32}
                    height={48}
                    sizes="32px"
                    className="h-12 w-8 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded-md bg-surface-raised text-foreground-muted">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                    </svg>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                  <p className="truncate text-xs text-foreground-muted">
                    {m.setName ?? "Unknown set"}
                    {m.cardNumber ? ` · #${m.cardNumber}` : ""}
                    {m.quantity > 1 ? ` · ×${m.quantity}` : ""}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium tabular-nums text-foreground">${m.price.toFixed(2)}</p>
                  <DailyChange change={m.change} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
