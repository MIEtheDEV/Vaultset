/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/utils/supabase/admin";
import { AdminReviewActions } from "@/components/AdminReviewActions";

export default async function AdminReviewsPage() {
  const admin = createAdminClient();

  const { data: reviews } = await admin
    .from("reviews")
    .select("id, rating, body, display_name, approved, pinned, created_at, user_id")
    .order("created_at", { ascending: false });

  const userIds = [...new Set((reviews ?? []).map((r) => r.user_id as string))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, username").in("id", userIds)
    : { data: [] as { id: string; username: string }[] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const pending  = (reviews ?? []).filter((r) => !r.approved);
  const approved = (reviews ?? []).filter((r) => r.approved);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Review Queue</h2>
        <p className="mt-0.5 text-sm text-foreground-muted">
          {pending.length} pending · {approved.length} approved
        </p>
      </div>

      {pending.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">Pending</h3>
          {pending.map((r) => (
            <ReviewCard key={r.id} review={r} profileMap={profileMap} />
          ))}
        </section>
      )}

      {approved.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">Approved</h3>
          {approved.map((r) => (
            <ReviewCard key={r.id} review={r} profileMap={profileMap} />
          ))}
        </section>
      )}

      {(reviews ?? []).length === 0 && (
        <p className="text-sm text-foreground-muted">No reviews yet.</p>
      )}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-gold text-sm">
      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
    </span>
  );
}

function ReviewCard({ review, profileMap }: { review: any; profileMap: Map<string, string> }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} />
            {review.pinned && (
              <span className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs text-gold">Pinned</span>
            )}
          </div>
          <p className="text-sm text-foreground">{review.body}</p>
          <p className="text-xs text-foreground-muted">
            {review.display_name ?? profileMap.get(review.user_id) ?? "unknown"}
            {" · "}
            @{profileMap.get(review.user_id) ?? "unknown"}
            {" · "}
            {new Date(review.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
      </div>
      <AdminReviewActions reviewId={review.id} approved={review.approved} pinned={review.pinned} />
    </div>
  );
}
