"use client";

import { useEffect, useRef, useState } from "react";

const REASONS = [
  "Inappropriate profile content",
  "Harassment or threatening behaviour",
  "Spam or scam",
  "Impersonation",
  "Other",
];

export function ReportButton({ reportedUserId }: { reportedUserId: string }) {
  const [open,      setOpen]      = useState(false);
  const [reason,    setReason]    = useState(REASONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res  = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportedUserId, reason }),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "Failed to submit report.");
      setSubmitting(false);
      return;
    }

    setDone(true);
    setSubmitting(false);
    setTimeout(() => { setOpen(false); setDone(false); }, 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-red-500/40 hover:text-red-400 transition-colors"
        aria-label="Report user"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        Report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" aria-hidden />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Report user"
            className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Report profile</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-foreground-muted hover:text-foreground transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {done ? (
              <div className="py-6 text-center space-y-2">
                <svg className="mx-auto text-emerald-400" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p className="text-sm text-foreground">Report submitted. Thank you.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-medium text-foreground-muted">Reason</label>
                  <div className="space-y-2">
                    {REASONS.map((r) => (
                      <label key={r} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="radio"
                          name="reason"
                          value={r}
                          checked={reason === r}
                          onChange={() => setReason(r)}
                          className="h-4 w-4 shrink-0 accent-gold"
                        />
                        <span className="text-sm text-foreground-muted group-hover:text-foreground transition-colors">
                          {r}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-red-400">{error}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded-full bg-red-500/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 transition-colors"
                  >
                    {submitting ? "Submitting…" : "Submit report"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
