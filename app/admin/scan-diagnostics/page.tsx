import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

// Hash-era top match (dist) — older rows carry the OCR-era shape (score) instead.
interface TopMatch { id?: string; name: string; set: string; number: string; dist?: number; score?: number }
interface ResultCard { id: string; name: string; set: string; number: string }
interface ScanRow {
  id: string;
  created_at: string;
  matched_via: string | null;
  match_distance: number | null;
  match_margin: number | null;
  pool_size: number | null;
  confident: boolean | null;
  top_matches: TopMatch[] | null;
  result_candidates: ResultCard[] | null;
  image_bytes: number | null;
  image_path: string | null;
  user_agent: string | null;
  // OCR-era columns, kept for historical rows
  ocr_text: string | null;
  name_candidates: string[] | null;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default async function ScanDiagnosticsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("scan_diagnostics")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as ScanRow[];

  // Signed URLs for the private scan images (1h). Batched.
  const paths = rows.map((r) => r.image_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await admin.storage.from("scan-diagnostics").createSignedUrls(paths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Scan Diagnostics</h2>
        <p className="mt-0.5 text-sm text-foreground-muted">
          Last {rows.length} card-scanner attempts. Each row is one scan — expand to see the match
          distances and candidates. Distance ≤ ~120 is a real hit; a small margin means a
          look-alike card was close (tune thresholds against these rows).
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-foreground-muted text-center">
          No scans logged yet. Run a scan from Add Card to populate this.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const results = r.result_candidates ?? [];
            const top = r.top_matches ?? [];
            const isHash = r.matched_via === "hash" || top.some((t) => typeof t.dist === "number");
            return (
              <details key={r.id} className="rounded-2xl border border-border bg-surface p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{when(r.created_at)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      results.length > 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {results.length > 0 ? `${results.length} result${results.length === 1 ? "" : "s"}` : "no results"}
                    </span>
                    {r.confident && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">confident</span>}
                    <span className="text-xs text-foreground-muted">
                      {isHash
                        ? `dist ${r.match_distance ?? "—"} · margin ${r.match_margin ?? "—"} · index ${r.pool_size ?? 0}`
                        : `ocr-era · pool ${r.pool_size ?? 0}`}
                      {r.image_bytes ? ` · ${Math.round(r.image_bytes / 1024)}KB` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-foreground-muted truncate">
                    top: {top.slice(0, 3).map((t) => `${t.name} #${t.number}`).join(", ") || "—"}
                  </p>
                </summary>

                <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs">
                  {r.image_path && signed.get(r.image_path) && (
                    <div>
                      <p className="font-semibold text-foreground mb-1">Scanned image (what the matcher saw)</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={signed.get(r.image_path)} alt="Scanned card" className="h-64 w-auto rounded-lg border border-border" />
                    </div>
                  )}

                  {top.length > 0 && (
                    <div>
                      <p className="font-semibold text-foreground mb-1">{isHash ? "Closest matches (distance)" : "Top ranked (OCR-era score)"}</p>
                      <div className="space-y-0.5 text-foreground-muted">
                        {top.map((t, i) => (
                          <p key={i} className="truncate">{t.dist ?? t.score} · {t.name} · {t.set} #{t.number}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.length > 0 && (
                    <div>
                      <p className="font-semibold text-foreground mb-1">Returned candidates</p>
                      <div className="space-y-0.5 text-foreground-muted">
                        {results.map((c, i) => (
                          <p key={i} className="truncate">{c.name} · {c.set} #{c.number} <span className="text-foreground-muted/60">({c.id})</span></p>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isHash && (
                    <div>
                      <p className="font-semibold text-foreground mb-1">Raw OCR text (legacy scan)</p>
                      <pre className="whitespace-pre-wrap break-words rounded-lg bg-surface-raised p-2 text-foreground-muted max-h-64 overflow-auto">
                        {r.ocr_text || "(nothing read)"}
                      </pre>
                    </div>
                  )}

                  {r.user_agent && (
                    <p className="text-foreground-muted/60 break-words">{r.user_agent}</p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
