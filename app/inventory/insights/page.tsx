import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { CollectionDna } from "@/components/CollectionDna";
import { EmptyState } from "@/components/ui/EmptyState";
import { computeCollectionInsights, type InsightItem, type Slice } from "@/lib/collectionInsights";
import { ORDINAL_GOLD, ordinalGoldStep } from "@/lib/chartTheme";

export const metadata: Metadata = {
  title: "Collection Insights",
  robots: { index: false },
};

/**
 * What your collection is made of.
 *
 * Free, deliberately. "What is my collection made of" is a different product from
 * "what did it earn" — cost basis and ROI stay Pro on /dashboard/analytics, and
 * nothing on this page touches paid price.
 */
export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: items } = await supabase
    .from("collection_items")
    .select(`
      quantity, market_price, condition, finish, grader,
      cards ( name, set_name, card_number, image_url, game, game_data )
    `)
    .eq("user_id", user!.id);

  const insights = computeCollectionInsights((items ?? []) as unknown as InsightItem[]);

  if (insights.totalCopies === 0) {
    return (
      <div className="space-y-8">
        <Header />
        <EmptyState
          size="lg"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 15l4-5 3 3 4-6" />
            </svg>
          }
          title="Nothing to break down yet"
          description="Add a few cards and this page will show what your collection is made of."
          cta="Add a card"
          href="/inventory/add"
        />
      </div>
    );
  }

  const { concentration } = insights;
  const valueCoverage = insights.pricedCopies < insights.totalCopies;

  return (
    <div className="space-y-8">
      <Header />

      {/* Hero: the single most interesting thing about most collections. */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          Value concentration
        </p>
        <p className="mt-2 text-4xl font-bold tabular-nums text-foreground sm:text-5xl">
          {concentration.pct.toFixed(0)}%
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          of your collection&apos;s value sits in its top{" "}
          {concentration.cards.length === 1 ? "card" : `${concentration.cards.length} cards`}.
        </p>

        <div className="mt-4">
          <Meter pct={concentration.pct} label={`Top cards hold ${concentration.pct.toFixed(0)}% of value`} />
        </div>

        {concentration.cards.length > 0 && (
          <ul className="mt-5 divide-y divide-border border-t border-border">
            {concentration.cards.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-center gap-3 py-2.5">
                <span className="w-4 shrink-0 text-center text-xs tabular-nums text-foreground-muted">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{c.name}</span>
                  {c.setName && (
                    <span className="block truncate text-xs text-foreground-muted">{c.setName}</span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-medium tabular-nums text-foreground">
                    ${c.value.toFixed(2)}
                  </span>
                  <span className="block text-xs tabular-nums text-foreground-muted">
                    {c.pct.toFixed(1)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Cards" value={insights.totalCopies.toLocaleString("en-US")} sub={`${insights.uniqueLines} line${insights.uniqueLines === 1 ? "" : "s"}`} />
        <Stat label="Sets" value={String(insights.uniqueSets)} sub="represented" />
        <Stat
          label="Graded"
          value={`${insights.gradedPct.toFixed(0)}%`}
          sub={`${insights.gradedCopies} of ${insights.totalCopies}`}
        />
        <Stat
          label="Market value"
          value={`$${insights.totalValue.toFixed(2)}`}
          sub={valueCoverage ? `${insights.pricedCopies} of ${insights.totalCopies} priced` : "all cards priced"}
        />
      </div>

      <CollectionDna insights={insights} />

      {/* Part-to-whole strips. Both dimensions are short and ordered, so one stacked
          bar each reads better than a second pair of bar charts. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <StackedStrip
          title="Condition"
          caption="Best to worst"
          slices={insights.byCondition}
          ordinal
        />
        <StackedStrip
          title="Finish"
          caption="Most common first"
          slices={insights.byFinish}
        />
      </div>

      {/* ROI lives behind Pro; this page is composition only. Pointing at it rather
          than teasing a locked panel here. */}
      <p className="text-xs text-foreground-muted">
        Looking for cost basis and ROI?{" "}
        <Link href="/dashboard/analytics" className="text-gold hover:underline">
          Portfolio analytics
        </Link>{" "}
        covers what your collection has earned.
      </p>
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Collection Insights</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          How your collection breaks down by rarity, set, condition and finish.
        </p>
      </div>
      <Link
        href="/inventory"
        className="text-sm text-foreground-muted transition-colors hover:text-foreground"
      >
        Back to vault →
      </Link>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-foreground-muted">{sub}</p>
    </div>
  );
}

/** A single ratio against its whole — the honest form for a two-part split. */
function Meter({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-surface-raised"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-gold" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/**
 * Horizontal stacked bar with a legend beneath.
 *
 * Segments are separated by a 2px gap in the surface colour rather than a stroke —
 * a border would add ink that isn't data. The legend is always present because
 * there are two or more series, so identity never rests on colour alone.
 */
function StackedStrip({
  title,
  caption,
  slices,
  ordinal = false,
}: {
  title: string;
  caption: string;
  slices: Slice[];
  ordinal?: boolean;
}) {
  if (slices.length === 0) return null;

  const colorAt = (i: number) =>
    ordinal ? ordinalGoldStep(i, slices.length) : ORDINAL_GOLD[ORDINAL_GOLD.length - 1 - (i % ORDINAL_GOLD.length)];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-foreground-muted">{caption}</p>
      </div>

      <div className="flex gap-[2px] overflow-hidden" style={{ height: 20 }}>
        {slices.map((s, i) => (
          <div
            key={s.key}
            title={`${s.label} — ${s.count} ${s.count === 1 ? "copy" : "copies"} (${s.pct.toFixed(1)}%)`}
            style={{
              flexGrow: Math.max(s.count, 0.001),
              flexBasis: 0,
              background: colorAt(i),
              borderTopLeftRadius: i === 0 ? 4 : 0,
              borderBottomLeftRadius: i === 0 ? 4 : 0,
              borderTopRightRadius: i === slices.length - 1 ? 4 : 0,
              borderBottomRightRadius: i === slices.length - 1 ? 4 : 0,
            }}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {slices.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: colorAt(i) }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground-muted">{s.label}</span>
            <span className="shrink-0 tabular-nums text-foreground">{s.count}</span>
            <span className="w-12 shrink-0 text-right tabular-nums text-foreground-muted">
              {s.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
