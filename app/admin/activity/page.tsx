import { createAdminClient } from "@/utils/supabase/admin";

const ACTION_META: Record<string, { label: string; className: string }> = {
  notify:         { label: "Notified user",      className: "border-violet-500/30 bg-violet-500/10 text-violet-400"  },
  warn:           { label: "Warned user",         className: "border-amber-500/30 bg-amber-500/10 text-amber-400"    },
  soft_ban:       { label: "Soft banned",         className: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
  ban:            { label: "Banned (report)",     className: "border-red-500/30 bg-red-500/10 text-red-400"          },
  ban_user:       { label: "Banned user",         className: "border-red-500/30 bg-red-500/10 text-red-400"          },
  unban_user:     { label: "Unbanned user",       className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  delete_user:    { label: "Deleted account",     className: "border-red-500/50 bg-red-500/15 text-red-400"          },
  dismiss_report: { label: "Dismissed report",    className: "border-border bg-surface-raised text-foreground-muted" },
  resolve_report: { label: "Resolved report",     className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  reopen_report:  { label: "Reopened report",     className: "border-border bg-surface-raised text-foreground-muted" },
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string }>;
}) {
  const { admin: adminFilter } = await searchParams;
  const admin = createAdminClient();

  // Fetch all unique admin IDs first for the filter UI
  const { data: allLog } = await admin
    .from("admin_audit_log")
    .select("admin_id")
    .not("admin_id", "is", null);

  const allAdminIds = [...new Set((allLog ?? []).map((e) => e.admin_id).filter(Boolean))];

  const { data: adminProfiles } = allAdminIds.length
    ? await admin.from("profiles").select("id, username").in("id", allAdminIds)
    : { data: [] };

  const adminProfileMap = new Map((adminProfiles ?? []).map((p) => [p.id, p.username as string]));

  // Resolve filter admin ID from username param
  const filterAdminId = adminFilter
    ? (adminProfiles ?? []).find((p) => p.username === adminFilter)?.id ?? null
    : null;

  // Fetch log, applying admin filter if set
  const query = admin
    .from("admin_audit_log")
    .select("id, admin_id, target_user_id, report_id, action, offense_type, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filterAdminId) query.eq("admin_id", filterAdminId);

  const { data: log } = await query;

  const allTargetIds = [...new Set((log ?? []).map((e) => e.target_user_id).filter(Boolean))];
  const allUserIds   = [...new Set([...allAdminIds, ...allTargetIds])];

  const { data: profiles } = allUserIds.length
    ? await admin.from("profiles").select("id, username").in("id", allUserIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username as string]));

  // Count actions per admin (always from full log)
  const adminActionCounts = new Map<string, number>();
  for (const entry of allLog ?? []) {
    if (!entry.admin_id) continue;
    adminActionCounts.set(entry.admin_id, (adminActionCounts.get(entry.admin_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Admin Activity</h2>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {adminFilter ? `Showing actions by @${adminFilter}` : "All moderation actions"} — last 200 entries
          </p>
        </div>
      </div>

      {/* Per-admin summary — clickable to filter */}
      {adminActionCounts.size > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">
            Actions by admin
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...adminActionCounts.entries()].map(([adminId, count]) => {
              const username  = adminProfileMap.get(adminId) ?? "unknown";
              const isActive  = adminFilter === username;
              return (
                <a
                  key={adminId}
                  href={isActive ? "/admin/activity" : `/admin/activity?admin=${username}`}
                  className={`rounded-2xl border p-5 space-y-1 transition-colors ${
                    isActive
                      ? "border-gold/40 bg-gold/5"
                      : "border-border bg-surface hover:border-gold/20"
                  }`}
                >
                  <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wide truncate">
                    @{username}
                  </p>
                  <p className="text-3xl font-bold text-foreground">{count}</p>
                  <p className="text-xs text-foreground-muted">
                    {isActive ? "click to clear" : "click to filter"}
                  </p>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Full log */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">
          {adminFilter ? `@${adminFilter}'s log` : "Full log"}
        </h3>
        {(log ?? []).length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center">
            <p className="text-sm text-foreground-muted">No admin actions recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface overflow-hidden">
            {(log ?? []).map((entry) => {
              const meta       = entry.metadata as Record<string, unknown> | null;
              const actionMeta = ACTION_META[entry.action] ?? { label: entry.action, className: "border-border bg-surface-raised text-foreground-muted" };
              const adminName  = profileMap.get(entry.admin_id) ?? "unknown";
              const targetName = entry.target_user_id
                ? (profileMap.get(entry.target_user_id) ?? (meta?.username as string) ?? entry.target_user_id.slice(0, 8) + "…")
                : null;

              return (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-raised/40 transition-colors">
                  <span className={`mt-0.5 shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${actionMeta.className}`}>
                    {actionMeta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">
                      {targetName ? (
                        <><span className="text-foreground-muted">on</span> <span className="font-medium">@{targetName}</span></>
                      ) : null}
                      {entry.offense_type ? (
                        <span className="text-foreground-muted"> · {entry.offense_type}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-foreground-muted mt-0.5">
                      <span className="text-gold font-medium">@{adminName}</span>
                      {" · "}
                      {fmt(entry.created_at)}
                      <span className="ml-1 opacity-60">{fmtTime(entry.created_at)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
