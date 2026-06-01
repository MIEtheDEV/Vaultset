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

  // Fetch actor usernames
  const actorIds = [...new Set((notifications ?? []).map((n) => n.actor_id).filter(Boolean))];
  const { data: actorProfiles } = actorIds.length
    ? await supabase.from("profiles").select("id, username").in("id", actorIds as string[])
    : { data: [] as { id: string; username: string }[] };
  const actorMap = new Map((actorProfiles ?? []).map((p) => [p.id, p.username]));

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

            if (n.type === "new_follower") {
              icon = (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              );
              content = actorUsername ? (
                <span>
                  <Link href={`/profile/${actorUsername}`} className="font-medium text-foreground hover:text-gold transition-colors">
                    @{actorUsername}
                  </Link>
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
              content = (
                <span>
                  {actorUsername ? (
                    <Link href={`/profile/${actorUsername}`} className="font-medium text-foreground hover:text-gold transition-colors">
                      @{actorUsername}
                    </Link>
                  ) : "Someone"}
                  {" "}sent you a{" "}
                  {data.offer_id ? (
                    <Link href={`/offers/${data.offer_id}`} className="font-medium text-foreground hover:text-gold transition-colors">
                      {typeLabel}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{typeLabel}</span>
                  )}
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
              content = (
                <span>
                  Price alert:{" "}
                  {data.listing_id ? (
                    <Link href={`/marketplace/${data.listing_id}`} className="font-medium text-foreground hover:text-gold transition-colors">
                      {data.card_name ?? "A wishlist card"}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{data.card_name ?? "A wishlist card"}</span>
                  )}
                  {" "}is listed at{" "}
                  <span className="font-medium text-gold">${Number(data.list_price ?? 0).toFixed(2)}</span>
                  {data.seller_username && (
                    <> by <Link href={`/profile/${data.seller_username}`} className="font-medium text-foreground hover:text-gold transition-colors">@{data.seller_username}</Link></>
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
              content = (
                <span>
                  {actorUsername ? (
                    <>
                      <Link href={`/profile/${actorUsername}`} className="font-medium text-foreground hover:text-gold transition-colors">
                        @{actorUsername}
                      </Link>
                      {" "}listed{" "}
                    </>
                  ) : "Someone listed "}
                  {data.listing_id ? (
                    <Link href={`/marketplace/${data.listing_id}`} className="font-medium text-foreground hover:text-gold transition-colors">
                      {data.card_name ?? "a card"}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{data.card_name ?? "a card"}</span>
                  )}
                  {" "}— a card on your wishlist
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

            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-5 py-4 transition-colors ${isUnread ? "bg-gold/5" : "hover:bg-surface-raised"}`}
              >
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
