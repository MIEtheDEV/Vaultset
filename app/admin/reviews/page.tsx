/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/utils/supabase/admin";
import { AdminReviewActions } from "@/components/AdminReviewActions";

export default async function AdminReviewsPage() {
  const admin = createAdminClient();

  const { data: reviews } = await admin
    .from("reviews")
    .select("id, rating, body, body_raw, display_name, anonymous, approved, pinned, hidden, moderation_flags, created_at, user_id")
    .order("created_at", { ascending: false });

  const userIds = [...new Set((reviews ?? []).map((r) => r.user_id as string))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, username").in("id", userIds)
    : { data: [] as { id: string; username: string }[] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  // Held reviews come first — they're off the site and off the aggregate rating
  // until someone acts, so they're the only ones that actually block on a human.
  const held     = (reviews ?? []).filter((r) => r.hidden);
  const pending  = (reviews ?? []).filter((r) => !r.hidden && !r.approved);
  const approved = (reviews ?? []).filter((r) => !r.hidden && r.approved);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Review Queue</h2>
        <p className="mt-0.5 text-sm text-foreground-muted">
          {held.length} held · {pending.length} pending · {approved.length} approved
        </p>
      </div>

      {held.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide">
            Held — hidden from the site and the rating
          </h3>
          {held.map((r) => (
            <ReviewCard key={r.id} review={r} profileMap={profileMap} />
          ))}
        </section>
      )}

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

const FLAG_LABELS: Record<string, string> = {
  hate_speech:      "Hate speech",
  link_or_contact:  "Link / contact details",
  profanity_masked: "Profanity masked",
};

function ReviewCard({ review, profileMap }: { review: any; profileMap: Map<string, string> }) {
  const flags: string[] = review.moderation_flags ?? [];

  return (
    <div className={`rounded-2xl border bg-surface p-5 space-y-3 ${review.hidden ? "border-red-500/40" : "border-border"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Stars rating={review.rating} />
            {review.hidden && (
              <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                Hidden from site
              </span>
            )}
            {review.pinned && (
              <span className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs text-gold">Pinned</span>
            )}
            {flags.map((f) => (
              <span key={f} className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted">
                {FLAG_LABELS[f] ?? f}
              </span>
            ))}
          </div>
          <p className="text-sm text-foreground">{review.body}</p>
          {/* The pre-masking original, kept so a false positive can be judged and restored. */}
          {review.body_raw && (
            <p className="text-xs text-foreground-muted">
              <span className="font-medium">Original:</span> {review.body_raw}
            </p>
          )}
          {/* Always shows who actually wrote it — anonymity is a display choice, not
              a gap in the record. "Shown as" is what the public sees. */}
          <p className="text-xs text-foreground-muted">
            Shown as {review.anonymous ? "“Anonymous collector”" : `“${review.display_name ?? "Vaultset collector"}”`}
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
        hidden={review.hidden}
      />
    </div>
  );
}
