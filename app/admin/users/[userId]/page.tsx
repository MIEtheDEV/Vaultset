import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";

function isBanned(bannedUntil: string | null | undefined) {
  if (!bannedUntil) return false;
  return new Date(bannedUntil) > new Date();
}

const ACTION_STYLES: Record<string, { label: string; className: string }> = {
  notify:   { label: "Notified",     className: "border-violet-500/30 bg-violet-500/10 text-violet-400" },
  warn:     { label: "Warning",      className: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
  soft_ban: { label: "Soft ban",     className: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
  ban:      { label: "Banned",       className: "border-red-500/30 bg-red-500/10 text-red-400" },
};

const WARN_NUMBER_STYLES = [
  "border-gold/40 bg-gold/10 text-gold",
  "border-orange-500/40 bg-orange-500/10 text-orange-400",
  "border-red-500/40 bg-red-500/10 text-red-400",
];

export default async function UserModerationPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const admin = createAdminClient();

  const [
    { data: { user: authUser }, error: authError },
    { data: profile },
    { data: warnings },
    { data: auditLog },
  ] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("username, cumulative_warnings, banned").eq("id", userId).single(),
    admin.from("user_warnings").select("id, offense_type, warning_number, created_at, report_id").eq("user_id", userId).order("created_at", { ascending: false }),
    admin.from("admin_audit_log").select("id, action, offense_type, metadata, created_at").eq("target_user_id", userId).order("created_at", { ascending: false }),
  ]);

  if (authError || !authUser) notFound();

  const banned       = isBanned(authUser.banned_until);
  const cumulative   = profile?.cumulative_warnings ?? 0;

  const totalWarnings  = (warnings ?? []).length;
  const totalNotifies  = (auditLog ?? []).filter((a) => a.action === "notify").length;
  const totalSoftBans  = (auditLog ?? []).filter((a) => a.action === "soft_ban").length;
  const totalBans      = (auditLog ?? []).filter((a) => a.action === "ban").length;

  // Group warnings by offense type
  const byType = new Map<string, typeof warnings>();
  for (const w of warnings ?? []) {
    if (!byType.has(w.offense_type)) byType.set(w.offense_type, []);
    byType.get(w.offense_type)!.push(w);
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/users"
              className="text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              ← Users
            </Link>
          </div>
          <h2 className="text-xl font-semibold text-foreground">
            {profile?.username ? `@${profile.username}` : authUser.email}
          </h2>
          <p className="text-sm text-foreground-muted mt-0.5">{authUser.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${
            banned
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          }`}>
            {banned ? "Banned" : "Active"}
          </span>
          {cumulative > 0 && (
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${
              cumulative >= 8 ? "border-red-500/30 bg-red-500/10 text-red-400" :
              cumulative >= 5 ? "border-orange-500/30 bg-orange-500/10 text-orange-400" :
                               "border-amber-500/30 bg-amber-500/10 text-amber-400"
            }`}>
              {cumulative} cumulative warning{cumulative !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Warnings",    value: totalWarnings  },
          { label: "Notified",    value: totalNotifies  },
          { label: "Soft bans",   value: totalSoftBans  },
          { label: "Perm bans",   value: totalBans      },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-5 space-y-1">
            <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wide">{label}</p>
            <p className="text-3xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Warnings by type */}
      {byType.size > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">
            Warnings by type
          </h3>
          <div className="space-y-3">
            {[...byType.entries()].map(([type, typeWarnings]) => (
              <div key={type} className="rounded-2xl border border-border bg-surface p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{type}</p>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    (typeWarnings?.length ?? 0) >= 3
                      ? "border-red-500/30 bg-red-500/10 text-red-400"
                      : (typeWarnings?.length ?? 0) === 2
                      ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                      : "border-gold/40 bg-gold/10 text-gold"
                  }`}>
                    {typeWarnings?.length ?? 0} warning{(typeWarnings?.length ?? 0) !== 1 ? "s" : ""}
                    {(typeWarnings?.length ?? 0) >= 3 ? " — ban tier" : ""}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {(typeWarnings ?? []).map((w) => (
                    <div key={w.id} className="flex items-center justify-between text-xs">
                      <span className={`rounded-full border px-2 py-0.5 font-medium ${
                        WARN_NUMBER_STYLES[Math.min(w.warning_number - 1, 2)]
                      }`}>
                        Warning #{w.warning_number}
                      </span>
                      <span className="text-foreground-muted">{fmt(w.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Audit timeline */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">
          Moderation history
        </h3>
        {(auditLog ?? []).length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="text-sm text-foreground-muted">No moderation actions on this account.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-raised/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wide">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wide">Offense</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wide">Detail</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(auditLog ?? []).map((entry) => {
                  const style = ACTION_STYLES[entry.action] ?? ACTION_STYLES["notify"];
                  const meta  = entry.metadata as Record<string, unknown> | null;
                  const detail =
                    entry.action === "warn"     ? `Warning #${meta?.warning_number ?? "?"} · ${meta?.cumulative ?? "?"} cumulative` :
                    entry.action === "soft_ban" ? `${meta?.label ?? "?"} (${meta?.cumulative ?? "?"} warnings)` :
                    entry.action === "ban"      ? "Permanent" :
                    null;

                  return (
                    <tr key={entry.id} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.className}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted">{entry.offense_type ?? "—"}</td>
                      <td className="px-4 py-3 text-foreground-muted">{detail ?? "—"}</td>
                      <td className="px-4 py-3 text-foreground-muted whitespace-nowrap">{fmt(entry.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
