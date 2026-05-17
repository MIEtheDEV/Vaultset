import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";

const stats = [
  {
    label: "Total Cards",
    value: "0",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    label: "Collection Value",
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

const quickActions = [
  { label: "Add Card",      href: "/inventory/add", comingSoon: false, icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )},
  { label: "Browse Market", href: "/marketplace",   comingSoon: false, icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )},
  { label: "Start a Trade", href: null,             comingSoon: true,  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )},
  { label: "View Profile",  href: null,             comingSoon: true,  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  )},
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const username = user?.user_metadata?.username as string;

  const [
    { data: quantityData },
    { count: cardListings },
    { count: sealedListings },
    { count: pendingTrades },
    { data: recentItems },
    { data: watchlistData },
  ] = await Promise.all([
    supabase.from("collection_items").select("quantity").eq("user_id", user!.id),
    supabase.from("collection_items").select("*", { count: "exact", head: true }).eq("user_id", user!.id).eq("for_sale", true),
    supabase.from("product_purchases").select("*", { count: "exact", head: true }).eq("user_id", user!.id).or("for_sale.eq.true,for_trade.eq.true"),
    supabase.from("collection_items").select("*", { count: "exact", head: true }).eq("user_id", user!.id).eq("for_trade", true),
    supabase.from("collection_items").select(`
      id, condition, grader, grade, quantity,
      cards ( name, set_name, card_number, image_url, game_data )
    `).eq("user_id", user!.id).order("created_at", { ascending: false }).limit(6),
    supabase.from("watchlist").select(`
      id, item_id,
      collection_items (
        id, for_sale, for_trade, list_price, grader, grade, condition,
        cards ( name, set_name, card_number, image_url )
      )
    `).eq("user_id", user!.id).order("created_at", { ascending: false }).limit(5),
  ]);

  const totalCards     = quantityData?.reduce((sum, r) => sum + (r.quantity ?? 1), 0) ?? 0;
  const activeListings = (cardListings ?? 0) + (sealedListings ?? 0);

  const dashboardStats = [
    { ...stats[0], value: String(totalCards) },
    { ...stats[1], value: "$0.00" },
    { ...stats[2], value: String(activeListings ?? 0) },
    { ...stats[3], value: String(pendingTrades  ?? 0) },
  ];

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting()}, <span className="text-gold">@{username}</span>
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Here&apos;s what&apos;s happening with your collection.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/report"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
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
          <Link
            href="/inventory/add"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Card
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {dashboardStats.map(({ label, value, icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">{label}</span>
              <span className="text-foreground-muted">{icon}</span>
            </div>
            <span className="text-2xl font-bold text-foreground">{value}</span>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Collection summary */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-surface">
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
                return (
                  <li key={item.id} className="flex items-center gap-4 px-6 py-3">
                    {card.image_url ? (
                      <img
                        src={card.image_url}
                        alt={card.name}
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
                    <div className="flex items-center gap-2 flex-shrink-0">
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

        {/* Market snapshot */}
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
      </div>

      {/* Bottom grid */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Recent activity */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-surface">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Recent Activity</h2>
          </div>
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            title="No recent activity"
            description="Your trades, listings, and purchases will appear here."
            cta="Browse the marketplace"
            href="/marketplace"
          />
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-border bg-surface">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Quick Actions</h2>
          </div>
          <div className="p-4 space-y-2">
            {quickActions.map(({ label, href, comingSoon, icon }) => (
              comingSoon ? (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-xl px-4 py-3 opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center gap-3 text-sm text-foreground-muted">
                    <span className="text-foreground-muted">{icon}</span>
                    {label}
                  </div>
                  <span className="text-xs font-medium text-gold">Coming Soon</span>
                </div>
              ) : (
                <Link
                  key={label}
                  href={href!}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-foreground-muted hover:bg-surface-raised hover:text-foreground transition-colors"
                >
                  <span className="text-gold">{icon}</span>
                  {label}
                </Link>
              )
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
