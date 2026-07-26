import { Skeleton, SkeletonStats, SkeletonPanel, SkeletonHeader } from "@/components/ui/Skeleton";

/**
 * The dashboard fans out ~19 parallel Supabase queries before it can render, so
 * this is the longest blank-screen window in the app. Mirrors the real page's
 * stacking order (greeting → pulse → stats → panels) to avoid a layout jump.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <SkeletonHeader />

      {/* Vault pulse / portfolio hero */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24 w-full" />
      </div>

      <SkeletonStats />

      <div className="grid lg:grid-cols-3 gap-6">
        <SkeletonPanel lines={5} className="lg:col-span-2" />
        <div className="space-y-6">
          <SkeletonPanel lines={3} />
          <SkeletonPanel lines={3} />
        </div>
      </div>
    </div>
  );
}
