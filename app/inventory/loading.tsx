import { Skeleton, SkeletonCardGrid, SkeletonHeader } from "@/components/ui/Skeleton";

/**
 * The inventory page loads every `collection_items` row plus 30 days of
 * `price_history` to compute per-card 24h change, so first paint waits on real work.
 */
export default function InventoryLoading() {
  return (
    <div className="space-y-8">
      <SkeletonHeader />

      {/* Pricing action bar */}
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-36 rounded-full" />
        <Skeleton className="h-9 w-44 rounded-full" />
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>

      {/* Filter pills + sort */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 flex-1 min-w-48 rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      <SkeletonCardGrid count={10} />
    </div>
  );
}
