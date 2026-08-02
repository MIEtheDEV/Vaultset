import type { ReactNode } from "react";

/** A hub's Q&A block. Rendered expanded (not in <details>) so the answer text is
 *  unambiguously part of the visible page — these pages exist partly to give
 *  Google's language classifier real English prose to read alongside the grid. */
export function HubFaq({
  heading,
  items,
}: {
  heading: string;
  items: { q: string; a: ReactNode }[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      <div className="rounded-2xl border border-border bg-surface divide-y divide-border">
        {items.map(({ q, a }) => (
          <div key={q} className="p-5 space-y-1.5">
            <h3 className="font-semibold text-foreground">{q}</h3>
            <div className="text-sm text-foreground-muted leading-relaxed">{a}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
