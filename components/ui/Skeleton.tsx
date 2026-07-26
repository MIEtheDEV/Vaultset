/**
 * Loading placeholders.
 *
 * These exist to back the route-level `loading.tsx` files. Several routes do
 * real work before first paint — the dashboard alone fans out ~19 Supabase
 * queries — and until now every one of them showed a blank screen for that whole
 * round trip, with no `loading.tsx` anywhere in the app.
 *
 * Server-safe (no client hooks). `motion-safe:` keeps the shimmer off for users
 * who asked for reduced motion; the blocks still convey layout without it.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`motion-safe:animate-pulse rounded-md bg-surface-raised ${className}`} />;
}

/** A bordered panel with a heading bar and n body lines. */
export function SkeletonPanel({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-5 space-y-4 ${className}`}>
      <Skeleton className="h-4 w-32" />
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3" />
        ))}
      </div>
    </div>
  );
}

/** The 4-up stat row used on the dashboard and profile. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface p-5 space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

/** A responsive grid of card-shaped tiles (inventory, marketplace, set grids). */
export function SkeletonCardGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-3 space-y-3">
          {/* 5:7 is the trading-card aspect ratio the real grids use. */}
          <Skeleton className="w-full aspect-[5/7]" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Page header: title + subtitle, with an optional action pill on the right. */
export function SkeletonHeader({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3 w-40" />
      </div>
      {action && <Skeleton className="h-9 w-28 rounded-full" />}
    </div>
  );
}
