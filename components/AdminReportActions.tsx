"use client";

import { useTransition, useState } from "react";
import {
  dismissReport,
  resolveReport,
  reopenReport,
  openAdminThread,
  notifyUser,
  warnUser,
  banUserFromReport,
} from "@/app/admin/reports/actions";

const WARN_STYLES = [
  { label: "1st warning", className: "border-gold/40 bg-gold/10 text-gold hover:bg-gold/20" },
  { label: "2nd warning", className: "border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20" },
  { label: "3rd warning", className: "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20" },
];

export function AdminReportActions({
  reportId,
  reportedUserId,
  reportedUsername,
  reporterUserId,
  reporterUsername,
  reason,
  status,
  notes,
  typeWarningCount,
}: {
  reportId: string;
  reportedUserId: string;
  reportedUsername: string;
  reporterUserId: string;
  reporterUsername: string;
  reason: string;
  status: string;
  notes: string | null;
  typeWarningCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [showNotes, setShowNotes]  = useState(false);
  const [notesText, setNotesText]  = useState(notes ?? "");

  const isBanTier = typeWarningCount >= 3;
  const warnStyle = WARN_STYLES[Math.min(typeWarningCount, 2)];

  if (status !== "open") {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {notes && <p className="text-xs text-foreground-muted italic flex-1">Note: {notes}</p>}
        <button
          disabled={pending}
          onClick={() => startTransition(() => reopenReport(reportId))}
          className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          Reopen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1 border-t border-border">
      {showNotes && (
        <textarea
          rows={2}
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
          placeholder="Internal note (not visible to users)…"
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-foreground-muted focus:border-gold/50 focus:outline-none transition-colors"
        />
      )}

      {/* Row 1: investigate */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-foreground-muted mr-1 shrink-0">Investigate:</p>
        <button
          disabled={pending}
          onClick={() => startTransition(() => openAdminThread(reporterUserId))}
          className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          Message @{reporterUsername}
        </button>
        <button
          disabled={pending}
          onClick={() => startTransition(() => openAdminThread(reportedUserId))}
          className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          Message @{reportedUsername}
        </button>
      </div>

      {/* Row 2: actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-foreground-muted mr-1 shrink-0">Action:</p>

        <button
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              notifyUser(reportId, reportedUserId, reason, reportedUsername)
            )
          }
          className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
        >
          Notify
        </button>

        {isBanTier ? (
          <button
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  `@${reportedUsername} has 3+ ${reason} warnings. This will permanently ban their account. Continue?`
                )
              ) {
                startTransition(() => banUserFromReport(reportId, reportedUserId, reason));
              }
            }}
            className="rounded-full border border-red-500/50 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
          >
            Ban (@{reportedUsername} · {typeWarningCount} {reason} warnings)
          </button>
        ) : (
          <button
            disabled={pending}
            onClick={() =>
              startTransition(() =>
                warnUser(reportId, reportedUserId, reason, reportedUsername)
              )
            }
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${warnStyle.className}`}
          >
            Warn — {warnStyle.label}
          </button>
        )}
      </div>

      {/* Row 3: report status */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-foreground-muted mr-1 shrink-0">Report:</p>
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
        >
          {showNotes ? "Hide note" : "Add note"}
        </button>
        <button
          disabled={pending}
          onClick={() => startTransition(() => dismissReport(reportId, notesText))}
          className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          disabled={pending}
          onClick={() => startTransition(() => resolveReport(reportId, notesText))}
          className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          Mark reviewed
        </button>
      </div>
    </div>
  );
}
