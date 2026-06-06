import Link from "next/link";
import { createAdminClient } from "@/utils/supabase/admin";
import { AdminReportActions } from "@/components/AdminReportActions";

const STATUS_FILTERS = [
  { label: "Open",      value: "open"      },
  { label: "Reviewed",  value: "reviewed"  },
  { label: "Dismissed", value: "dismissed" },
  { label: "All",       value: "all"       },
] as const;

const REASON_COLORS: Record<string, string> = {
  "Spam or scam":                       "border-amber-500/30 bg-amber-500/10 text-amber-400",
  "Harassment or threatening behaviour": "border-red-500/30 bg-red-500/10 text-red-400",
  "Inappropriate profile content":       "border-orange-500/30 bg-orange-500/10 text-orange-400",
  "Impersonation":                       "border-violet-500/30 bg-violet-500/10 text-violet-400",
  "Other":                               "border-border bg-surface-raised text-foreground-muted",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusFilter = "open" } = await searchParams;
  const admin = createAdminClient();

  const query = admin
    .from("reports")
    .select("id, reporter_id, reported_user_id, reason, status, notes, created_at")
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") query.eq("status", statusFilter);

  const { data: reports } = await query;

  const reportedUserIds = [...new Set((reports ?? []).map((r) => r.reported_user_id))];
  const allUserIds      = [
    ...new Set([
      ...(reports ?? []).map((r) => r.reporter_id),
      ...reportedUserIds,
    ]),
  ];

  const [{ data: profiles }, { data: typeWarnings }, { data: warnProfiles }] = await Promise.all([
    allUserIds.length
      ? admin.from("profiles").select("id, username").in("id", allUserIds)
      : Promise.resolve({ data: [] }),
    reportedUserIds.length
      ? admin.from("user_warnings").select("user_id, offense_type").in("user_id", reportedUserIds)
      : Promise.resolve({ data: [] }),
    reportedUserIds.length
      ? admin.from("profiles").select("id, cumulative_warnings").in("id", reportedUserIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap        = new Map((profiles ?? []).map((p) => [p.id, p.username as string]));
  const cumulativeMap     = new Map((warnProfiles ?? []).map((p) => [p.id, p.cumulative_warnings as number]));

  // typeWarningCount[userId][offenseType] = count
  const typeWarningMap = new Map<string, Map<string, number>>();
  for (const w of typeWarnings ?? []) {
    if (!typeWarningMap.has(w.user_id)) typeWarningMap.set(w.user_id, new Map());
    const byType = typeWarningMap.get(w.user_id)!;
    byType.set(w.offense_type, (byType.get(w.offense_type) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Reports</h2>
        <p className="mt-0.5 text-sm text-foreground-muted">
          {(reports ?? []).length} {statusFilter === "all" ? "total" : statusFilter}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/reports?status=${f.value}`}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              statusFilter === f.value
                ? "bg-surface-raised text-foreground font-medium"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {(reports ?? []).length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center">
          <p className="text-sm text-foreground-muted">
            No {statusFilter === "all" ? "" : statusFilter} reports.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(reports ?? []).map((report) => {
            const reportedUsername  = profileMap.get(report.reported_user_id) ?? "unknown";
            const reporterUsername  = profileMap.get(report.reporter_id) ?? "unknown";
            const reasonColor       = REASON_COLORS[report.reason] ?? REASON_COLORS["Other"];
            const typeCount         = typeWarningMap.get(report.reported_user_id)?.get(report.reason) ?? 0;
            const cumulative        = cumulativeMap.get(report.reported_user_id) ?? 0;

            return (
              <div key={report.id} className="rounded-2xl border border-border bg-surface p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${reasonColor}`}>
                        {report.reason}
                      </span>
                      {report.status !== "open" && (
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            report.status === "reviewed"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-border bg-surface-raised text-foreground-muted"
                          }`}
                        >
                          {report.status}
                        </span>
                      )}
                      {typeCount > 0 && (
                        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground-muted">
                          {typeCount} prior {report.reason.split(" ")[0].toLowerCase()} warning{typeCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {cumulative > 0 && (
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          cumulative >= 8  ? "border-red-500/30 bg-red-500/10 text-red-400" :
                          cumulative >= 5  ? "border-orange-500/30 bg-orange-500/10 text-orange-400" :
                          cumulative >= 2  ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                                            "border-border bg-surface-raised text-foreground-muted"
                        }`}>
                          {cumulative} cumulative warning{cumulative !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground">
                        Reported:{" "}
                        <Link
                          href={`/profile/${reportedUsername}`}
                          className="font-medium text-gold hover:text-gold-light transition-colors"
                        >
                          @{reportedUsername}
                        </Link>
                      </p>
                      <p className="text-xs text-foreground-muted">
                        By @{reporterUsername} ·{" "}
                        {new Date(report.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                <AdminReportActions
                  reportId={report.id}
                  reportedUserId={report.reported_user_id}
                  reportedUsername={reportedUsername}
                  reporterUserId={report.reporter_id}
                  reporterUsername={reporterUsername}
                  reason={report.reason}
                  status={report.status}
                  notes={report.notes}
                  typeWarningCount={typeCount}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
