import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-1">
      <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-foreground-muted">{sub}</p>}
    </div>
  );
}

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString();
}

export default async function AdminAnalyticsPage() {
  const admin = createAdminClient();

  const now = new Date();
  const weekAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    authResult,
    cardCountsResult,
    offersResult,
    pendingReviewsResult,
    approvedReviewsResult,
    revealsResult,
    warningsResult,
    warningsByTypeResult,
    auditResult,
  ] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    // Card totals as physical copies (sum of quantity), cap-free via SQL aggregate.
    admin.rpc("admin_card_counts"),
    admin.from("offers").select("status"),
    admin.from("reviews").select("*", { count: "exact", head: true }).eq("approved", false),
    admin.from("reviews").select("*", { count: "exact", head: true }).eq("approved", true),
    admin.from("pack_reveals").select("*", { count: "exact", head: true }),
    admin.from("user_warnings").select("*", { count: "exact", head: true }),
    admin.from("user_warnings").select("offense_type"),
    admin.from("admin_audit_log").select("action"),
  ]);

  const authData            = authResult.data;
  const cardCounts          = (cardCountsResult.data?.[0] ?? {}) as
    { total_qty?: number; for_sale_qty?: number; for_trade_qty?: number };
  const totalItems          = cardCounts.total_qty;
  const activeListings      = cardCounts.for_sale_qty;
  const tradeListings       = cardCounts.for_trade_qty;
  const offerRows           = offersResult.data;
  const pendingReviews      = pendingReviewsResult.count;
  const approvedReviews     = approvedReviewsResult.count;
  const totalReveals        = revealsResult.count;
  const totalWarnings       = warningsResult.count;
  const warningsByType      = warningsByTypeResult.data;
  const auditRows           = auditResult.data;

  const users = authData?.users ?? [];
  const totalUsers   = users.length;
  const newThisWeek  = users.filter((u) => u.created_at >= weekAgo).length;
  const newThisMonth = users.filter((u) => u.created_at >= monthAgo).length;
  const activeRecent = users.filter((u) => u.last_sign_in_at && u.last_sign_in_at >= weekAgo).length;

  const offers = offerRows ?? [];
  const completedOffers = offers.filter((o) => o.status === "accepted").length;
  const pendingOffers   = offers.filter((o) => o.status === "pending").length;

  const audit       = auditRows ?? [];
  const totalNotify = audit.filter((a) => a.action === "notify").length;
  const totalSoftBans = audit.filter((a) => a.action === "soft_ban").length;
  const totalBans   = audit.filter((a) => a.action === "ban").length;

  const warnTypeCounts = new Map<string, number>();
  for (const w of warningsByType ?? []) {
    warnTypeCounts.set(w.offense_type, (warnTypeCounts.get(w.offense_type) ?? 0) + 1);
  }
  const warnTypeEntries = [...warnTypeCounts.entries()].sort((a, b) => b[1] - a[1]);

  const recentSignups = [...users]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Analytics</h2>
        <p className="mt-0.5 text-sm text-foreground-muted">Platform-wide metrics</p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">Users</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Users"     value={fmt(totalUsers)} />
          <StatCard label="New This Week"   value={fmt(newThisWeek)} />
          <StatCard label="New This Month"  value={fmt(newThisMonth)} />
          <StatCard label="Active (7 days)" value={fmt(activeRecent)} sub="signed in" />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">Content</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Cards in Collections" value={fmt(totalItems)} />
          <StatCard label="Active Listings"       value={fmt(activeListings)} sub="for sale" />
          <StatCard label="Trade Listings"         value={fmt(tradeListings)} sub="for trade" />
          <StatCard label="Pack Reveals"           value={fmt(totalReveals)} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">Activity</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Completed Offers" value={fmt(completedOffers)} sub="accepted" />
          <StatCard label="Open Offers"      value={fmt(pendingOffers)}   sub="pending" />
          <StatCard label="Pending Reviews"  value={fmt(pendingReviews)} />
          <StatCard label="Approved Reviews" value={fmt(approvedReviews)} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">Moderation</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Warnings"  value={fmt(totalWarnings)} />
          <StatCard label="Notifications"   value={fmt(totalNotify)}   sub="users notified" />
          <StatCard label="Soft Bans"       value={fmt(totalSoftBans)} sub="auto-triggered" />
          <StatCard label="Permanent Bans"  value={fmt(totalBans)} />
        </div>
        {warnTypeEntries.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
            <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wide">Warnings by type</p>
            <div className="space-y-2">
              {warnTypeEntries.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between gap-4">
                  <p className="text-sm text-foreground">{type}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 h-1.5 rounded-full bg-surface-raised overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gold/60"
                        style={{ width: `${Math.round((count / (totalWarnings ?? 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-foreground w-6 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">Recent Signups</h3>
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface overflow-hidden">
          {recentSignups.length === 0 ? (
            <p className="text-sm text-foreground-muted text-center py-8">No users yet.</p>
          ) : recentSignups.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-raised/40 transition-colors">
              <p className="text-sm text-foreground truncate min-w-0">{u.email ?? "—"}</p>
              <div className="shrink-0 text-right">
                <p className="text-xs text-foreground-muted whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <p className="text-xs text-foreground-muted/60 whitespace-nowrap">
                  {u.last_sign_in_at
                    ? new Date(u.last_sign_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "Never signed in"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
