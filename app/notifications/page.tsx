import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { timeAgo } from "@/lib/timeAgo";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false },
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, actor_id, data, read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Fetch actor usernames + the current user's own username (for self-links)
  const actorIds = [...new Set((notifications ?? []).map((n) => n.actor_id).filter(Boolean))];
  const [{ data: actorProfiles }, { data: myProfile }] = await Promise.all([
    actorIds.length
      ? supabase.from("profiles").select("id, username").in("id", actorIds as string[])
      : Promise.resolve({ data: [] as { id: string; username: string }[] }),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
  ]);
  const actorMap = new Map((actorProfiles ?? []).map((p) => [p.id, p.username]));
  const myUsername = (myProfile as { username?: string } | null)?.username ?? null;

  // Mark all as read
  const unreadIds = (notifications ?? []).filter((n) => !n.read).map((n) => n.id);
  if (unreadIds.length > 0) {
    const admin = createAdminClient();
    await admin.from("notifications").update({ read: true }).in("id", unreadIds);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-foreground-muted">Your recent activity and updates.</p>
      </div>

      {!notifications || notifications.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center">
          <p className="text-sm text-foreground-muted">No notifications yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
          {notifications.map((n) => {
            const actorUsername = n.actor_id ? actorMap.get(n.actor_id) : null;
            const isUnread = !n.read;

            let icon: React.ReactNode;
            let content: React.ReactNode;
            let href: string | null = null;

            if (n.type === "new_follower") {
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              );
              href = actorUsername ? `/profile/${actorUsername}` : null;
              content = actorUsername ? (
                <span>
                  <span className="font-medium text-foreground">@{actorUsername}</span>
                  {" "}started following you
                </span>
              ) : (
                <span>Someone started following you</span>
              );
            } else if (n.type === "new_offer") {
              const data = n.data as { offer_id?: string; offer_type?: string };
              const typeLabel =
                data.offer_type === "trade"  ? "Trade Offer" :
                data.offer_type === "bundle" ? "Bundle Request" : "Cash Offer";
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              );
              href = data.offer_id ? `/offers/${data.offer_id}` : "/offers";
              content = (
                <span>
                  {actorUsername ? <span className="font-medium text-foreground">@{actorUsername}</span> : "Someone"}
                  {" "}sent you a{" "}
                  <span className="font-medium text-foreground">{typeLabel}</span>
                </span>
              );
            } else if (n.type === "price_alert") {
              const data = n.data as { listing_id?: string; card_name?: string; list_price?: number; seller_username?: string };
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              );
              href = data.listing_id ? `/marketplace/${data.listing_id}` : "/marketplace";
              content = (
                <span>
                  Price alert:{" "}
                  <span className="font-medium text-foreground">{data.card_name ?? "A wishlist card"}</span>
                  {" "}is listed at{" "}
                  <span className="font-medium text-gold">${Number(data.list_price ?? 0).toFixed(2)}</span>
                  {data.seller_username && (
                    <> by <span className="font-medium text-foreground">@{data.seller_username}</span></>
                  )}
                </span>
              );
            } else if (n.type === "wishlist_listing_match") {
              const data = n.data as { card_name?: string; listing_id?: string };
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gold">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              );
              href = data.listing_id ? `/marketplace/${data.listing_id}` : "/marketplace";
              content = (
                <span>
                  {actorUsername ? (
                    <>
                      <span className="font-medium text-foreground">@{actorUsername}</span>
                      {" "}listed{" "}
                    </>
                  ) : "Someone listed "}
                  <span className="font-medium text-foreground">{data.card_name ?? "a card"}</span>
                  {" "}— a card on your wishlist
                </span>
              );
            } else if (n.type === "new_review") {
              const data = n.data as { reviewer_username?: string };
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              );
              href = "/admin/reviews";
              content = (
                <span>
                  <span className="font-medium text-foreground">@{data.reviewer_username ?? "A collector"}</span>
                  {" "}submitted a review —{" "}
                  <span className="font-medium text-gold">Review queue →</span>
                </span>
              );
            } else if (n.type === "badge_earned") {
              const data = n.data as { badge_slug?: string; badge_label?: string; badge_description?: string };
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
                  <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
                  <polyline points="2,8.5 12,15 22,8.5" />
                  <line x1="12" y1="15" x2="12" y2="22" />
                </svg>
              );
              href = myUsername ? `/profile/${myUsername}` : null;
              content = (
                <span>
                  You earned the{" "}
                  <span className="font-medium text-foreground">{data.badge_label ?? data.badge_slug}</span>
                  {" "}badge
                  {data.badge_description && (
                    <span className="text-foreground-muted"> — {data.badge_description}</span>
                  )}
                </span>
              );
            } else if (n.type === "test_push") {
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              );
              href = "/account";
              content = <span>Test notification — your push setup is working. 🎉</span>;
            } else if (n.type === "new_message") {
              const data = n.data as { conversation_id?: string; preview?: string };
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              );
              href = data.conversation_id ? `/messages/${data.conversation_id}` : "/messages";
              content = (
                <span>
                  <span className="font-medium text-foreground">{actorUsername ? `@${actorUsername}` : "Someone"}</span>
                  {" "}sent you a message
                  {data.preview ? <span className="text-foreground-muted">: “{data.preview}”</span> : null}
                </span>
              );
            } else {
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              );
              content = <span className="text-foreground-muted">New notification</span>;
            }

            const rowClass = `flex items-start gap-3 px-5 py-4 transition-colors ${isUnread ? "bg-gold/5 " : ""}${href ? "hover:bg-surface-raised cursor-pointer" : !isUnread ? "hover:bg-surface-raised" : ""}`;

            const rowInner = (
              <>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised">
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground-muted leading-relaxed">{content}</p>
                  <p className="mt-0.5 text-xs text-foreground-muted">{timeAgo(n.created_at)}</p>
                </div>
                {isUnread && (
                  <span className="mt-2 h-2 w-2 rounded-full bg-gold shrink-0" />
                )}
              </>
            );

            return href ? (
              <Link key={n.id} href={href} className={rowClass}>
                {rowInner}
              </Link>
            ) : (
              <div key={n.id} className={rowClass}>
                {rowInner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
