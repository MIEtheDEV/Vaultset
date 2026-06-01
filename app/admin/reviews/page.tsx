/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { AppNav } from "@/components/AppNav";
import { AdminReviewActions } from "@/components/AdminReviewActions";

export default async function AdminReviewsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const username = user.user_metadata?.username as string;
  if (username !== process.env.ADMIN_USERNAME) redirect("/dashboard");

  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("reviews")
    .select("id, rating, body, display_name, approved, pinned, created_at, user_id")
    .order("created_at", { ascending: false });

  const userIds = [...new Set((pending ?? []).map((r) => r.user_id as string))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, username").in("id", userIds)
    : { data: [] as { id: string; username: string }[] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const unapproved = (pending ?? []).filter((r) => !r.approved);
  const approved   = (pending ?? []).filter((r) => r.approved);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <AppNav username={username} />
      <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {unapproved.length} pending · {approved.length} approved
          </p>
        </div>

        {unapproved.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">Pending</h2>
            {unapproved.map((r) => (
              <ReviewCard key={r.id} review={r} profileMap={profileMap} />
            ))}
          </section>
        )}

        {approved.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">Approved</h2>
            {approved.map((r) => (
              <ReviewCard key={r.id} review={r} profileMap={profileMap} />
            ))}
          </section>
        )}

        {(pending ?? []).length === 0 && (
          <p className="text-sm text-foreground-muted">No reviews yet.</p>
        )}
      </main>
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
      <AdminReviewActions
        reviewId={review.id}
        approved={review.approved}
        pinned={review.pinned}
      />
    </div>
  );
}
