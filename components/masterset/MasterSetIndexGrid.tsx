"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { splitSecretRares } from "@/lib/sets/setDisplay";
import type { SetSummary, Progress } from "@/lib/sets/masterset";

type Sort = "progress" | "newest" | "oldest" | "name";

const SORT_LABELS: Record<Sort, string> = {
  progress: "Progress",
  newest: "Newest",
  oldest: "Oldest",
  name: "A–Z",
};

const pct = (p: Progress) => (p.total > 0 ? p.owned / p.total : 0);

function MiniBar({ label, progress }: { label: string; progress: Progress }) {
  const p = progress.total > 0 ? Math.round((progress.owned / progress.total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-foreground-muted">{label}</span>
        <span className="text-foreground tabular-nums">{progress.owned}/{progress.total} · {p}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function MasterSetIndexGrid({ summaries }: { summaries: SetSummary[] }) {
  const [sort, setSort] = useState<Sort>("progress");
  const startedCount = summaries.filter((s) => s.complete.owned > 0).length;

  const sorted = useMemo(() => {
    const arr = [...summaries];
    switch (sort) {
      case "newest":
        return arr.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
      case "oldest":
        return arr.sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""));
      case "name":
        return arr.sort((a, b) => a.setName.localeCompare(b.setName));
      case "progress":
      default:
        // Started sets first (by completion %), then the rest by newest release.
        return arr.sort((a, b) => {
          const ap = pct(a.complete), bp = pct(b.complete);
          if ((ap > 0) !== (bp > 0)) return bp - ap > 0 ? 1 : -1;
          if (ap !== bp) return bp - ap;
          return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");
        });
    }
  }, [summaries, sort]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-foreground-muted">
          {startedCount > 0 ? (
            <>You&apos;ve started <span className="text-gold font-semibold">{startedCount}</span> set{startedCount !== 1 ? "s" : ""}.</>
          ) : (
            <>Pick a set to start tracking.</>
          )}
        </p>
        <label className="flex items-center gap-2 text-sm text-foreground-muted">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-foreground focus:border-gold/50 focus:outline-none"
          >
            {(Object.keys(SORT_LABELS) as Sort[]).map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-foreground-muted">No sets available yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((s) => {
            const { regular, secret } = splitSecretRares(s.complete.total, s.printedTotal);
            return (
              <Link
                key={s.setCode}
                href={`/masterset/${encodeURIComponent(s.setCode)}`}
                className="rounded-2xl border border-border bg-surface p-4 space-y-3 hover:border-gold/30 hover:bg-surface-raised transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-14 shrink-0">
                    {s.logo && <Image src={s.logo} alt={s.setName} fill sizes="56px" className="object-contain" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate">{s.setName}</p>
                    <p className="text-xs text-foreground-muted truncate">
                      {s.series ? `${s.series} · ` : ""}
                      {`${regular} cards${secret > 0 ? ` + ${secret} secret` : ""}`}
                      {s.releaseYear ? ` · ${s.releaseYear}` : ""}
                    </p>
                  </div>
                </div>
                <MiniBar label="Complete" progress={s.complete} />
                <MiniBar label="Master" progress={s.master} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
