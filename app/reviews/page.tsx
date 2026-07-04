import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/utils/supabase/admin";

export const metadata: Metadata = {
  title: "Collector Reviews — Vaultset",
  alternates: { canonical: "/reviews" },
  description: "See what Pokémon TCG collectors are saying about Vaultset — the free collection tracker, marketplace, and community platform.",
};

export default async function ReviewsPage() {
  const admin = createAdminClient();

  const { data: reviews } = await admin
    .from("reviews")
    .select("id, rating, body, display_name, created_at")
    .eq("approved", true)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const all          = reviews ?? [];
  const count        = all.length;
  const average      = count > 0
    ? all.reduce((sum, r) => sum + (r.rating as number), 0) / count
    : 0;
  const pct          = (average / 5) * 100;

  const reviewsLd = count > 0 ? {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Vaultset",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://vaultset.app",
    aggregateRating: { "@type": "AggregateRating", ratingValue: average.toFixed(1), reviewCount: count, bestRating: 5, worstRating: 1 },
    review: all.slice(0, 20).map((r) => ({
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      author: { "@type": "Person", name: (r.display_name as string) ?? "Vaultset collector" },
      reviewBody: r.body as string,
      ...(r.created_at ? { datePublished: new Date(r.created_at as string).toISOString().slice(0, 10) } : {}),
    })),
  } : null;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {reviewsLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewsLd) }} />
      )}

      {/* Minimal nav */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/img/icon.png" alt="Vaultset" width={28} height={28} />
            <span className="hidden md:block text-lg font-bold tracking-widest text-gold group-hover:text-gold-light transition-colors">VAULTSET</span>
          </Link>
          <Link href="/" className="text-sm text-foreground-muted hover:text-foreground transition-colors">
            ← Back to home
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-16 space-y-12">

        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">What collectors are saying</h1>
          {count > 0 && (
            <div className="flex flex-col items-center gap-2">
              {/* Star bar */}
              <div className="flex items-center gap-3">
                <div className="relative inline-flex text-2xl leading-none select-none">
                  <span className="text-border">{"★★★★★"}</span>
                  <span
                    className="absolute inset-0 overflow-hidden text-gold"
                    style={{ width: `${pct}%` }}
                  >
                    {"★★★★★"}
                  </span>
                </div>
                <div>
                  <span className="text-lg font-bold text-foreground">{average.toFixed(1)}</span>
                  <span className="text-sm text-foreground-muted ml-1.5">
                    out of 5 · {count} review{count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Reviews grid */}
        {count === 0 ? (
          <div className="rounded-2xl border border-border bg-surface py-24 text-center">
            <p className="text-sm text-foreground-muted">No reviews yet — check back soon.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {all.map((review) => (
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
        )}

        {/* CTA */}
        <div className="text-center space-y-4 pt-8 border-t border-border">
          <p className="text-foreground-muted">Ready to start tracking your collection?</p>
          <Link
            href="/register"
            className="inline-block rounded-full bg-gold px-8 py-3 font-semibold text-background hover:bg-gold-light transition-colors"
          >
            Create Free Account
          </Link>
        </div>

      </main>
    </div>
  );
}
