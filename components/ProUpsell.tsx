import Link from "next/link";

/**
 * Contextual "Upgrade to Pro" teaser shown in place of a gated feature. The gate
 * is a marketing surface — never a blank/erroring page. Pass the feature name and
 * a short description of what Pro unlocks here.
 */
export function ProUpsell({
  title,
  description,
  compact = false,
}: {
  title: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-gold/30 bg-gold/5 text-center ${compact ? "p-4" : "p-8"}`}>
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p className="font-semibold text-foreground">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">{description}</p>}
      <Link
        href="/pricing"
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
      >
        Upgrade to Pro
      </Link>
    </div>
  );
}
