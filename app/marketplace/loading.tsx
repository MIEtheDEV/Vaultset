import { Skeleton, SkeletonCardGrid, SkeletonHeader } from "@/components/ui/Skeleton";

export default function MarketplaceLoading() {
  return (
    <div className="space-y-8">
      <SkeletonHeader />

      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 flex-1 min-w-48 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <SkeletonCardGrid count={10} />
    </div>
  );
}
