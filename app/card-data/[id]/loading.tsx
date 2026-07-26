import { Skeleton, SkeletonPanel } from "@/components/ui/Skeleton";

/**
 * Card detail resolves pricing on demand (`/api/card-price`) and can hit
 * pokemontcg.io / JustTCG on a cache miss, so this window is real.
 * Scoped to `[id]` rather than the whole `card-data` subtree so the search index
 * page doesn't flash a detail-shaped skeleton.
 */
export default function CardDetailLoading() {
  return (
    <div className="space-y-8">
      <div className="grid lg:grid-cols-[320px_1fr] gap-8">
        <Skeleton className="w-full aspect-[5/7] rounded-xl" />

        <div className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-4 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
          <SkeletonPanel lines={4} />
        </div>
      </div>

      {/* Price history chart */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-56 w-full" />
      </div>

      <SkeletonPanel lines={4} />
    </div>
  );
}
