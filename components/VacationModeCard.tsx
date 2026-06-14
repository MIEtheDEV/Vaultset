"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { checkText } from "@/lib/moderation";
import { isOnVacation } from "@/lib/vacation";

function inputClass() {
  return "w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors";
}
function labelClass() {
  return "mb-1.5 block text-sm font-medium text-foreground-muted";
}

function ProTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      Pro
    </span>
  );
}

/** datetime-local <-> ISO conversion (local wall-clock time). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface Props {
  userId: string;
  initialVacationMode: boolean;
  initialMessage: string;
  initialStartsAt: string | null;
  initialEndsAt: string | null;
}

export function VacationModeCard({
  userId,
  initialVacationMode,
  initialMessage,
  initialStartsAt,
  initialEndsAt,
}: Props) {
  const router = useRouter();

  const [vacationMode, setVacationMode] = useState(initialVacationMode);
  const [message,      setMessage]      = useState(initialMessage);
  const [startsAt,     setStartsAt]     = useState(isoToLocalInput(initialStartsAt));
  const [endsAt,       setEndsAt]       = useState(isoToLocalInput(initialEndsAt));

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  const startsIso = localInputToIso(startsAt);
  const endsIso   = localInputToIso(endsAt);
  const paused    = isOnVacation({
    vacation_mode:      vacationMode,
    vacation_starts_at: startsIso,
    vacation_ends_at:   endsIso,
  });

  async function handleSave() {
    setError("");
    setSuccess("");

    if (endsIso && startsIso && new Date(endsIso) <= new Date(startsIso)) {
      setError("The return date must be after the start date.");
      return;
    }
    const trimmed = message.trim();
    if (trimmed) {
      const violation = checkText(trimmed);
      if (violation) { setError(`Away message: ${violation}`); return; }
    }

    setLoading(true);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("profiles")
      .update({
        vacation_mode:      vacationMode,
        vacation_message:   trimmed || null,
        vacation_starts_at: startsIso,
        vacation_ends_at:   endsIso,
      })
      .eq("id", userId);

    if (saveError) {
      setError(saveError.message);
      setLoading(false);
      return;
    }

    setSuccess("Marketplace availability updated.");
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Marketplace Availability</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Going away? Pause your listings so buyers don&apos;t make offers you can&apos;t fulfill.
          Your inventory is untouched — listings simply hide from the marketplace until you&apos;re back.
        </p>
      </div>

      {paused && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-2.5 text-sm text-amber-400">
          Your listings are currently <span className="font-semibold">paused</span> and hidden from the marketplace.
        </div>
      )}

      {/* Basic pause — free */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <p className="text-sm font-medium text-foreground">Pause all my listings</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Instantly hide every active listing from the marketplace. Toggle off to relist.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={vacationMode}
          onClick={() => setVacationMode((v) => !v)}
          className={`relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors ${
            vacationMode ? "border-gold bg-gold" : "border-border bg-surface-raised"
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-background shadow transition-transform ${
              vacationMode ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="border-t border-border" />

      {/* Scheduled window + auto-reply — Pro */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">Schedule a vacation</p>
          <ProTag />
        </div>
        <p className="-mt-2 text-xs text-foreground-muted">
          Set dates and your listings pause and relist automatically — no need to remember to toggle.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label className={labelClass()}>Pause from</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={`${inputClass()} min-w-0 max-w-full`}
            />
          </div>
          <div className="min-w-0">
            <label className={labelClass()}>Relist on</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className={`${inputClass()} min-w-0 max-w-full`}
            />
          </div>
        </div>

        <div>
          <label className={labelClass()}>Away message (auto-reply)</label>
          <textarea
            maxLength={200}
            rows={2}
            placeholder="e.g. Away until June 20th — offers welcome when I'm back!"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={`${inputClass()} resize-none`}
          />
          <p className="mt-1.5 text-xs text-foreground-muted">
            {message.length}/200 — shown to buyers on your paused listings and storefront.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">{success}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={loading}
        className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
      >
        {loading ? "Saving…" : "Save Availability"}
      </button>
    </div>
  );
}
