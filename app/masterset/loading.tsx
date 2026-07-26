import { Skeleton, SkeletonHeader } from "@/components/ui/Skeleton";

/**
 * `/masterset` computes completion for every set via the `set_completion_totals()`
 * RPC, so the grid can't paint until that returns. Tiles carry two progress bars
 * (Complete Set + Master Set) to match the real layout.
 */
export default function MasterSetLoading() {
  return (
    <div className="space-y-8">
      <SkeletonHeader />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
