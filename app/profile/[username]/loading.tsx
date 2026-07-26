import { Skeleton, SkeletonStats, SkeletonCardGrid } from "@/components/ui/Skeleton";

export default function ProfileLoading() {
  return (
    <div className="space-y-8">
      {/* Identity header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <Skeleton className="h-20 w-20 rounded-full shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>

      <SkeletonStats count={5} />

      {/* Badge board */}
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-14 rounded-lg" />
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-border pb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <SkeletonCardGrid count={10} />
    </div>
  );
}
