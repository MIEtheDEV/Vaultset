import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { RefreshMarketButton } from "@/components/RefreshMarketButton";
import { SupporterBadge } from "@/components/SupporterBadge";
import { ProBadge } from "@/components/ProBadge";
import { isProSubscriber, hasProAccess } from "@/lib/proStatus";
import { ProUpsell } from "@/components/ProUpsell";
import { ReviewPrompt } from "@/components/ReviewPrompt";
import { InstallPwaCallout } from "@/components/InstallPwaCallout";
import { createAdminClient } from "@/utils/supabase/admin";
import { isUserAdmin } from "@/lib/auth/admin";
import { PortfolioChart } from "@/components/PortfolioChart";
import { withLiveToday } from "@/lib/priceHistory";
import { timeAgo } from "@/lib/timeAgo";
import { BADGE_MAP, computeEarnedSlugs, awardBadges, type BadgeSlug } from "@/lib/badges";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false },
};

const stats = [
  {
    label: "Total Cards",
    value: "0",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="14" height="18" rx="2" /><rect x="8" y="1" width="14" height="18" rx="2" />
      </svg>
    ),
  },
  {
    label: "Market Value",
    value: "$0.00",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    label: "Active Listings",
    value: "0",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <circle cx="7" cy="7" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Pending Trades",
    value: "0",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
  },
];


function EmptyState({ icon, title, description, cta, href }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised text-foreground-muted">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
      </div>
      <Link
        href={href}
        className="mt-1 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
      >
        {cta}
      </Link>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}


type ActivityEvent = {
  id: string;
  type: "card_added" | "card_listed" | "wishlist_added" | "product_added" | "product_listed" | "message_received" | "badge_earned";
  created_at: string;
  label: string;
  sublabel?: string;
  image_url?: string | null;
  href: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const username = user?.user_metadata?.username as string;

  const isAdmin = user ? await isUserAdmin(user.id) : false;

  const quickActions = [
    { label: "Add Card",      href: "/inventory/add",       comingSoon: false, icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    )},
    { label: "Browse Market", href: "/marketplace",         comingSoon: false, icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    )},
    { label: "Start a Trade", href: "/marketplace?filter=for_trade", comingSoon: false, icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    )},
    { label: "View Profile",  href: `/profile/${username}`, comingSoon: false, icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    )},
    ...(isAdmin ? [{
      label: "Admin Dashboard", href: "/admin/analytics", comingSoon: false, icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    }] : []),
  ];

  const [
    { data: quantityData },
    { data: cardListingRows },
    { count: sealedListings },
    { data: tradeRows },
    { data: recentItems },
    { data: watchlistData },
    { data: refreshLog },
    { data: profileData },
    { data: matchData },
    { data: wishlistItems },
    { data: recentProducts },
    { data: recentMessages },
    { count: existingReviewCount },
    { data: priceHistoryRaw },
    { data: gradedRows },
    { count: userFollowerCount },
    { data: badgeData },
    { data: rpcBadgeSlugs },
    { data: sealedValueRows },
  ] = await Promise.all([
    supabase.from("collection_items").select("quantity, market_price").eq("user_id", user!.id),
    supabase.from("collection_items").select("quantity").eq("user_id", user!.id).eq("for_sale", true),
    supabase.from("product_purchases").select("*", { count: "exact", head: true }).eq("user_id", user!.id).or("for_sale.eq.true,for_trade.eq.true"),
    supabase.from("collection_items").select("quantity").eq("user_id", user!.id).eq("for_trade", true),
    supabase.from("collection_items").select(`
      id, condition, grader, grade, quantity, for_sale, for_trade, list_price, created_at,
      cards ( name, set_name, card_number, image_url, game_data )
    `).eq("user_id", user!.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("watchlist").select(`
      id, item_id,
      collection_items (
        id, for_sale, for_trade, list_price, grader, grade, condition,
        cards ( name, set_name, card_number, image_url )
      )
    `).eq("user_id", user!.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("market_refresh_log").select("refreshed_at").eq("user_id", user!.id).maybeSingle(),
    supabase.from("profiles").select("is_supporter, is_pro, pro_plan, pro_expires_at, pro_auto_renews, pwa_installed_at").eq("id", user!.id).single(),
    supabase.rpc("get_wishlist_matches", { p_user_id: user!.id }),
    supabase.from("wishlist_items").select("id, card_name, set_name, card_number, image_url, created_at").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("product_purchases").select("id, name, product_type, for_sale, for_trade, list_price, created_at").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("messages").select("id, body, created_at, sender_id, conversation_id").neq("sender_id", user!.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
    supabase
      .from("price_history")
      .select("snapshotted_at, market_price, collection_items(quantity)")
      .eq("user_id", user!.id)
      .order("snapshotted_at", { ascending: true }),
    supabase
      .from("collection_items")
      .select("quantity")
      .eq("user_id", user!.id)
      .not("grader", "is", null),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", user!.id),
    supabase
      .from("user_badges")
      .select("badge_slug, earned_at")
      .eq("user_id", user!.id),
    supabase.rpc("check_user_badges", { p_user_id: user!.id }),
    supabase.from("product_purchases").select("market_value").eq("user_id", user!.id),
  ]);

  // Dedupe matches by listing_id (multiple wishlist items can match same listing)
  const wishlistMatches = Array.from(
    new Map(((matchData as { listing_id: string; seller_id: string; seller_username: string; for_sale: boolean; for_trade: boolean; list_price: number | null; card_name: string; image_url: string | null }[] | null) ?? []).map((m) => [m.listing_id, m])).values()
  ).slice(0, 10);

  const isSupporter = profileData?.is_supporter ?? false;
  const pwaInstalled = Boolean((profileData as any)?.pwa_installed_at);
  const isProSub    = isProSubscriber(profileData as any);
  const canPro      = hasProAccess(profileData as any); // entitlement (incl. one-time payers)

  // Following feed: get who this user follows, then their recent listings
  const { data: myFollowsData } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", user!.id);

  const followingIds = (myFollowsData ?? []).map((f) => f.following_id);

  const feedItems = followingIds.length > 0
    ? await supabase
        .from("collection_items")
        .select(`
          id, user_id, for_sale, for_trade, list_price, created_at,
          cards ( name, set_name, image_url )
        `)
        .in("user_id", followingIds)
        .or("for_sale.eq.true,for_trade.eq.true")
        .eq("on_hold", false)
        .order("created_at", { ascending: false })
        .limit(12)
    : { data: [] };

  const feedUserIds = [...new Set((feedItems.data ?? []).map((i) => i.user_id))];
  const { data: feedProfiles } = feedUserIds.length
    ? await supabase.from("profiles").select("id, username").in("id", feedUserIds)
    : { data: [] as { id: string; username: string }[] };
  const feedProfileMap = new Map((feedProfiles ?? []).map((p) => [p.id, p.username]));

  // Resolve sender usernames for received messages
  const senderIds = [...new Set((recentMessages ?? []).map((m) => m.sender_id))];
  const { data: senderProfiles } = senderIds.length
    ? await supabase.from("profiles").select("id, username").in("id", senderIds)
    : { data: [] as { id: string; username: string }[] };
  const senderMap = new Map((senderProfiles ?? []).map((p) => [p.id, p.username]));

  const totalCards       = quantityData?.reduce((sum, r) => sum + (r.quantity ?? 1), 0) ?? 0;
  const singlesValue     = quantityData?.reduce((sum, r) => {
    return sum + (r.market_price != null ? Number(r.market_price) * (r.quantity ?? 1) : 0);
  }, 0) ?? 0;
  // Total collection value spans singles AND sealed products (each sealed row is
  // one unit, so no quantity multiplier).
  const sealedValue      = (sealedValueRows ?? []).reduce((sum, r) => {
    return sum + ((r as any).market_value != null ? Number((r as any).market_value) : 0);
  }, 0);
  const collectionValue  = singlesValue + sealedValue;
  // Card counts reflect physical copies (sum of quantity), not row/line-item counts,
  // so they stay consistent with Total Cards. Sealed products have no quantity (1 row = 1 unit).
  const cardListings    = (cardListingRows ?? []).reduce((sum, r) => sum + (r.quantity ?? 1), 0);
  const pendingTrades   = (tradeRows       ?? []).reduce((sum, r) => sum + (r.quantity ?? 1), 0);
  const gradedItemCount = (gradedRows      ?? []).reduce((sum, r) => sum + (r.quantity ?? 1), 0);
  const activeListings  = cardListings + (sealedListings ?? 0);

  // Check and award any newly earned achievement badges
  const existingBadgeMap = new Map(
    (badgeData ?? []).map((b) => [b.badge_slug as BadgeSlug, b.earned_at as string])
  );
  const inMemorySlugs = computeEarnedSlugs({
    totalCards,
    activeListings,
    forTradeCount: pendingTrades ?? 0,
    gradedCount: gradedItemCount ?? 0,
    collectionValue,
    followerCount: userFollowerCount ?? 0,
    followingCount: followingIds.length,
  });
  const dbSlugs = (rpcBadgeSlugs ?? []) as BadgeSlug[];
  const computedSlugs = [...new Set([...inMemorySlugs, ...dbSlugs])];
  const newSlugs = computedSlugs.filter((s) => !existingBadgeMap.has(s));
  const awardedSlugs = await awardBadges(supabase, user!.id, newSlugs);

  // Fire a system notification for each newly earned badge
  if (awardedSlugs.length > 0) {
    const admin = createAdminClient();
    await admin.from("notifications").insert(
      awardedSlugs.map((slug) => ({
        user_id:  user!.id,
        type:     "badge_earned",
        actor_id: null,
        data:     { badge_slug: slug, badge_label: BADGE_MAP.get(slug)?.label, badge_description: BADGE_MAP.get(slug)?.description },
      }))
    );
  }

  // Badge activity events: all earned (from DB) + any newly awarded this load
  const nowIso = new Date().toISOString();
  const badgeActivityEvents: ActivityEvent[] = [
    ...(badgeData ?? []).map((b) => ({
      id:         `badge-${b.badge_slug}`,
      type:       "badge_earned" as const,
      created_at: b.earned_at as string,
      label:      `Earned the ${BADGE_MAP.get(b.badge_slug as BadgeSlug)?.label ?? b.badge_slug} badge`,
      sublabel:   BADGE_MAP.get(b.badge_slug as BadgeSlug)?.description,
      href:       `/profile/${username}`,
    })),
    ...awardedSlugs.map((slug) => ({
      id:         `badge-${slug}`,
      type:       "badge_earned" as const,
      created_at: nowIso,
      label:      `Earned the ${BADGE_MAP.get(slug)?.label ?? slug} badge`,
      sublabel:   BADGE_MAP.get(slug)?.description,
      href:       `/profile/${username}`,
    })),
  ];

  const activityEvents: ActivityEvent[] = [
    ...(recentItems ?? []).map((item) => {
      const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
      const isListed = (item as any).for_sale || (item as any).for_trade;
      return {
        id: `card-${item.id}`,
        type: (isListed ? "card_listed" : "card_added") as ActivityEvent["type"],
        created_at: (item as any).created_at as string,
        label: isListed
          ? `Listed ${card?.name ?? "a card"}${(item as any).for_sale && (item as any).list_price ? ` for $${Number((item as any).list_price).toFixed(2)}` : " for trade"}`
          : `Added ${card?.name ?? "a card"} to collection`,
        sublabel: card ? `${card.set_name}${card.card_number ? ` · ${card.card_number}` : ""}` : undefined,
        image_url: card?.image_url ?? null,
        href: isListed ? `/marketplace/${item.id}` : `/inventory/${item.id}/edit`,
      };
    }),
    ...(wishlistItems ?? []).map((item) => ({
      id: `wish-${item.id}`,
      type: "wishlist_added" as ActivityEvent["type"],
      created_at: (item as any).created_at as string ?? "",
      label: `Added ${item.card_name} to wishlist`,
      sublabel: `${item.set_name}${item.card_number ? ` · ${item.card_number}` : ""}`,
      image_url: item.image_url ?? null,
      href: "/wishlist",
    })),
    ...(recentProducts ?? []).map((p) => {
      const isListed = p.for_sale || p.for_trade;
      return {
        id: `prod-${p.id}`,
        type: (isListed ? "product_listed" : "product_added") as ActivityEvent["type"],
        created_at: p.created_at as string,
        label: isListed
          ? `Listed ${p.name}${p.for_sale && p.list_price ? ` for $${Number(p.list_price).toFixed(2)}` : " for trade"}`
          : `Added ${p.name} to inventory`,
        sublabel: (p.product_type as string | null)?.replace(/_/g, " ") ?? undefined,
        image_url: null,
        href: "/inventory/products",
      };
    }),
    ...(recentMessages ?? []).map((m) => ({
      id: `msg-${m.id}`,
      type: "message_received" as ActivityEvent["type"],
      created_at: m.created_at as string,
      label: `Message from @${senderMap.get(m.sender_id) ?? "someone"}`,
      sublabel: (m.body as string).length > 70 ? (m.body as string).slice(0, 70) + "…" : m.body as string,
      image_url: null,
      href: `/messages/${m.conversation_id}`,
    })),
    ...(badgeActivityEvents ?? []),
  ]
    .filter((e) => e.created_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15);

  const portfolioSnapshots = Object.entries(
    (priceHistoryRaw ?? []).reduce<Record<string, number>>((acc, row) => {
      const qty = (row.collection_items as any)?.quantity ?? 1;
      acc[row.snapshotted_at] = (acc[row.snapshotted_at] ?? 0) + Number(row.market_price) * qty;
      return acc;
    }, {})
  )
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  // Snapshots are written once daily (02:00 UTC); a manual refresh or an add/edit
  // moves the live value after that. Stamp the live "Market Value" onto today so the
  // chart's headline matches the Market Value stat instead of lagging the snapshot.
  const portfolioHistory = withLiveToday(portfolioSnapshots, collectionValue);

  const dashboardStats = [
    { ...stats[0], value: String(totalCards) },
    { ...stats[1], value: `$${collectionValue.toFixed(2)}` },
    { ...stats[2], value: String(activeListings ?? 0) },
    { ...stats[3], value: String(pendingTrades  ?? 0) },
  ];

  return (
    <div className="space-y-8">

      <InstallPwaCallout serverInstalled={pwaInstalled} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 flex-wrap">
            {greeting()}, <span className="text-gold">@{username}</span>
            {isProSub && <ProBadge />}
            {isSupporter && <SupporterBadge />}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Here&apos;s what&apos;s happening with your collection.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/analytics"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted whitespace-nowrap hover:border-gold/40 hover:text-foreground transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Analytics
            </Link>
            <Link
              href="/dashboard/report"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted whitespace-nowrap hover:border-gold/40 hover:text-foreground transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Generate Report
            </Link>
          </div>
          {canPro ? (
            <RefreshMarketButton lastRefreshedAt={refreshLog?.refreshed_at ?? null} />
          ) : (
            <Link href="/pricing" className="text-xs text-foreground-muted hover:text-gold transition-colors">
              Prices update automatically · <span className="text-gold">Upgrade for on-demand refresh →</span>
            </Link>
          )}
        </div>
      </div>

      {/* Review prompt — shown once user has 10+ cards and hasn't reviewed */}
      {totalCards >= 10 && (existingReviewCount ?? 0) === 0 && (
        <ReviewPrompt username={username} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {dashboardStats.map(({ label, value, icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between mb-3 min-h-8">
              <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">{label}</span>
              <span className="text-foreground-muted">{icon}</span>
            </div>
            <span className="text-2xl font-bold text-foreground">{value}</span>
          </div>
        ))}
      </div>

      {/* Portfolio value chart — Pro feature */}
      {canPro ? (
        <PortfolioChart data={portfolioHistory} />
      ) : (
        <ProUpsell
          title="Price history charts"
          description="Track your portfolio's value over time with Pro — daily snapshots across 7D / 30D / 90D / All."
        />
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickActions.map(({ label, href, comingSoon, icon }) => (
          comingSoon ? (
            <div
              key={label}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-5 opacity-50 cursor-not-allowed"
            >
              <span className="text-foreground-muted">{icon}</span>
              <span className="text-xs font-medium text-foreground-muted">{label}</span>
              <span className="text-xs text-gold">Soon</span>
            </div>
          ) : (
            <Link
              key={label}
              href={href!}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-5 hover:border-gold/40 hover:bg-surface-raised transition-colors group"
            >
              <span className="text-foreground-muted group-hover:text-gold transition-colors">{icon}</span>
              <span className="text-xs font-medium text-foreground-muted group-hover:text-foreground transition-colors">{label}</span>
            </Link>
          )
        ))}
      </div>

      {/* Wishlist matches — Available Now */}
      {wishlistMatches.length > 0 && (() => {
        const saleMatches  = wishlistMatches.filter((m) => m.for_sale);
        const tradeMatches = wishlistMatches.filter((m) => !m.for_sale && m.for_trade);

        function MatchCard({ match }: { match: typeof wishlistMatches[number] }) {
          return (
            <Link
              href={`/marketplace/${match.listing_id}`}
              className="flex-shrink-0 w-36 rounded-xl border border-gold/20 bg-surface p-3 space-y-2 hover:border-gold/50 hover:bg-surface-raised transition-colors"
            >
              <div className="relative aspect-[2.5/3.5] w-full overflow-hidden rounded-lg bg-surface-raised">
                {match.image_url ? (
                  <Image src={match.image_url} alt={match.card_name} fill sizes="144px" className="object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-xs font-medium text-foreground truncate leading-tight">{match.card_name}</p>
              <div>
                {match.for_sale && match.list_price != null ? (
                  <span className="text-xs font-semibold text-gold">${Number(match.list_price).toFixed(2)}</span>
                ) : (
                  <span className="text-xs font-medium text-blue-400">Trade</span>
                )}
              </div>
              <p className="text-xs text-foreground-muted truncate">@{match.seller_username}</p>
            </Link>
          );
        }

        return (
          <div className="space-y-4">
            {saleMatches.length > 0 && (
              <div className="rounded-2xl border border-gold/20 bg-gold/5">
                <div className="flex items-center justify-between border-b border-gold/20 px-6 py-4">
                  <div>
                    <h2 className="font-semibold text-foreground">Available Now</h2>
                    <p className="text-xs text-foreground-muted mt-0.5">Wishlist cards listed for sale</p>
                  </div>
                  <Link href="/wishlist" className="text-xs text-gold hover:text-gold-light transition-colors">
                    View wishlist →
                  </Link>
                </div>
                <div className="p-4 flex gap-3 overflow-x-auto">
                  {saleMatches.map((m) => <MatchCard key={m.listing_id} match={m} />)}
                </div>
              </div>
            )}
            {tradeMatches.length > 0 && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center justify-between border-b border-blue-500/20 px-6 py-4">
                  <div>
                    <h2 className="font-semibold text-foreground">Trade Matches</h2>
                    <p className="text-xs text-foreground-muted mt-0.5">Wishlist cards collectors are willing to trade</p>
                  </div>
                  <Link href={`/marketplace?filter=wanted`} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    Browse trades →
                  </Link>
                </div>
                <div className="p-4 flex gap-3 overflow-x-auto">
                  {tradeMatches.map((m) => <MatchCard key={m.listing_id} match={m} />)}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Following Feed */}
      {followingIds.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Following</h2>
            <Link href="/marketplace?filter=following" className="text-xs text-foreground-muted hover:text-gold transition-colors">
              View in Marketplace
            </Link>
          </div>
          {!feedItems.data || feedItems.data.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-foreground-muted">No recent listings from people you follow.</p>
            </div>
          ) : (
            <div className="p-4 flex gap-3 overflow-x-auto pb-4">
              {feedItems.data.map((item) => {
                const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
                const sellerUsername = feedProfileMap.get(item.user_id) ?? "unknown";
                return (
                  <Link
                    key={item.id}
                    href={`/marketplace/${item.id}`}
                    className="flex-shrink-0 w-36 rounded-xl border border-border bg-surface-raised p-3 space-y-2 hover:border-gold/30 transition-colors"
                  >
                    <div className="relative aspect-[2.5/3.5] w-full overflow-hidden rounded-lg bg-surface">
                      {card?.image_url ? (
                        <Image src={card.image_url} alt={card.name} fill sizes="144px" className="object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-foreground truncate">{card?.name ?? "—"}</p>
                    <p className="text-xs text-foreground-muted truncate">@{sellerUsername}</p>
                    <div>
                      {item.for_sale && item.list_price != null ? (
                        <span className="text-xs font-semibold text-gold">${Number(item.list_price).toFixed(2)}</span>
                      ) : (
                        <span className="text-xs text-blue-400">Trade</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Collection summary */}
        <div className="min-w-0 lg:col-span-2 rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Recently Added</h2>
            <Link href="/inventory" className="text-xs text-foreground-muted hover:text-gold transition-colors">
              View all
            </Link>
          </div>
          {recentItems && recentItems.length > 0 ? (
            <ul className="divide-y divide-border">
              {recentItems.map((item) => {
                const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
                if (!card) return null;
                const hasTags = Boolean(item.grader || item.condition || (card as any).game_data?.is_promo || item.quantity > 1);
                return (
                  <li key={item.id} className="flex flex-col gap-2 px-6 py-3">
                    <div className="flex items-center gap-4">
                      {card.image_url ? (
                        <Image
                          src={card.image_url}
                          alt={card.name}
                          width={32}
                          height={48}
                          sizes="32px"
                          className="h-12 w-8 rounded-md object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className={`relative h-12 w-8 rounded-md flex-shrink-0 overflow-hidden ${(card as any).game_data?.is_promo ? "border border-gold/40 bg-surface shadow-[0_0_8px_rgba(232,184,75,0.15)]" : "bg-surface-raised"}`}>
                          {(card as any).game_data?.is_promo && (
                            <Image src="/img/promo.png" alt="Promo Card" fill sizes="32px" className="object-contain p-0.5" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{card.name}</p>
                        <p className="text-xs text-foreground-muted truncate">
                          {card.set_name}{card.card_number ? ` · ${card.card_number}` : ""}
                        </p>
                      </div>
                    </div>
                    {hasTags && (
                      <div className="flex flex-wrap items-center gap-2">
                        {item.grader ? (
                          <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                            {item.grader} {item.grade}
                          </span>
                        ) : item.condition ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted capitalize">
                            {item.condition.replace(/_/g, " ")}
                          </span>
                        ) : null}
                        {(card as any).game_data?.is_promo && (
                          <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">Promo</span>
                        )}
                        {item.quantity > 1 && (
                          <span className="text-xs text-foreground-muted">×{item.quantity}</span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
              }
              title="Your vault is empty"
              description="Start adding cards to track your collection."
              cta="Add your first card"
              href="/inventory/add"
            />
          )}
        </div>

        {/* Right column: Watchlist + Wishlist */}
        <div className="flex flex-col gap-6">

        {/* Watchlist */}
        <div className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Watchlist</h2>
            <Link href="/marketplace" className="text-xs text-foreground-muted hover:text-gold transition-colors">
              Browse
            </Link>
          </div>
          {watchlistData && watchlistData.length > 0 ? (
            <ul className="divide-y divide-border">
              {watchlistData.map((entry) => {
                const item = Array.isArray(entry.collection_items) ? entry.collection_items[0] : entry.collection_items;
                const card = item ? (Array.isArray((item as any).cards) ? (item as any).cards[0] : (item as any).cards) : null;
                if (!item || !card) return null;
                return (
                  <li key={entry.id}>
                    <Link href={`/marketplace/${(item as any).id}`} className="flex items-center gap-3 px-6 py-3 hover:bg-surface-raised transition-colors">
                      <div className="relative h-12 w-8 rounded-md overflow-hidden flex-shrink-0 bg-surface-raised">
                        {card.image_url && (
                          <Image src={card.image_url} alt={card.name} fill sizes="32px" className="object-contain" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{card.name}</p>
                        <p className="text-xs text-foreground-muted truncate">{card.set_name}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {(item as any).for_sale && (item as any).list_price != null ? (
                          <span className="text-sm font-semibold text-gold">${Number((item as any).list_price).toFixed(2)}</span>
                        ) : (
                          <span className="text-xs text-blue-400">For Trade</span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
              <li className="px-6 py-3 text-center">
                <Link href="/marketplace" className="text-xs text-gold hover:text-gold-light transition-colors">
                  View all in Marketplace →
                </Link>
              </li>
            </ul>
          ) : (
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              }
              title="No cards on your watchlist"
              description="Heart a listing in the marketplace to track it here."
              cta="Browse the market"
              href="/marketplace"
            />
          )}
        </div>

        {/* Wishlist */}
        <div className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Wishlist</h2>
            <Link href="/wishlist" className="text-xs text-foreground-muted hover:text-gold transition-colors">
              Manage
            </Link>
          </div>
          {wishlistItems && wishlistItems.length > 0 ? (
            <ul className="divide-y divide-border">
              {wishlistItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-6 py-3">
                  <div className="relative h-12 w-8 rounded-md overflow-hidden flex-shrink-0 bg-surface-raised">
                    {item.image_url && (
                      <Image src={item.image_url} alt={item.card_name} fill sizes="32px" className="object-contain" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.card_name}</p>
                    <p className="text-xs text-foreground-muted truncate">
                      {item.set_name}{item.card_number ? ` · ${item.card_number}` : ""}
                    </p>
                  </div>
                </li>
              ))}
              <li className="px-6 py-3 text-center">
                <Link href="/wishlist" className="text-xs text-gold hover:text-gold-light transition-colors">
                  View full wishlist →
                </Link>
              </li>
            </ul>
          ) : (
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 2H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 2v20m0 0h10a2 2 0 0 0 2-2V8M9 22H5a2 2 0 0 1-2-2V8m0 0h18" />
                </svg>
              }
              title="Your wishlist is empty"
              description="Add cards you're hunting for to track them here."
              cta="Add to wishlist"
              href="/wishlist/add"
            />
          )}
        </div>

        </div>{/* end right column */}
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Recent Activity</h2>
        </div>
        {activityEvents.length > 0 ? (
          <ul className="divide-y divide-border">
            {activityEvents.map((event) => {
              const iconConfig: Record<ActivityEvent["type"], { bg: string; icon: React.ReactNode }> = {
                card_added: {
                  bg: "bg-emerald-500/10 text-emerald-400",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="18" rx="2"/><rect x="8" y="1" width="14" height="18" rx="2"/></svg>,
                },
                card_listed: {
                  bg: "bg-gold/10 text-gold",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>,
                },
                wishlist_added: {
                  bg: "bg-violet-500/10 text-violet-400",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
                },
                product_added: {
                  bg: "bg-blue-500/10 text-blue-400",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
                },
                product_listed: {
                  bg: "bg-gold/10 text-gold",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>,
                },
                message_received: {
                  bg: "bg-teal-500/10 text-teal-400",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
                },
                badge_earned: {
                  bg: "bg-gold/10 text-gold",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" /><polyline points="2,8.5 12,15 22,8.5" /><line x1="12" y1="15" x2="12" y2="22" /></svg>,
                },
              };
              const { bg, icon } = iconConfig[event.type];
              return (
                <li key={event.id}>
                  <Link href={event.href} className="flex flex-col gap-2 px-6 py-3 hover:bg-surface-raised transition-colors sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex items-center gap-4 min-w-0 sm:contents">
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${bg}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{event.label}</p>
                        {event.sublabel && (
                          <p className="text-xs text-foreground-muted truncate">{event.sublabel}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:contents">
                      {event.image_url && (
                        <div className="relative h-10 w-7 rounded overflow-hidden flex-shrink-0 bg-surface-raised">
                          <Image src={event.image_url} alt={event.label} fill sizes="28px" className="object-contain" />
                        </div>
                      )}
                      <span className="text-xs text-foreground-muted flex-shrink-0 sm:pl-2">{timeAgo(event.created_at)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            title="No recent activity"
            description="Add cards to your collection or list something in the marketplace to get started."
            cta="Add a card"
            href="/inventory/add"
          />
        )}
      </div>

    </div>
  );
}
