import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

interface TopMatch { name: string; set: string; number: string; score: number }
interface ResultCard { id: string; name: string; set: string; number: string }
interface ScanRow {
  id: string;
  created_at: string;
  ocr_text: string | null;
  ocr_char_count: number | null;
  name_candidates: string[] | null;
  extracted_number: string | null;
  reliable_number: string | null;
  number_hints: string[] | null;
  pool_size: number | null;
  justtcg_appended: number | null;
  confident: boolean | null;
  top_matches: TopMatch[] | null;
  result_candidates: ResultCard[] | null;
  image_bytes: number | null;
  image_path: string | null;
  user_agent: string | null;
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
          Last {rows.length} card-scanner attempts. Each row is one scan — expand to see the raw OCR
          text and matching. Use this to tell OCR-quality failures (garbled text) from matching
          failures (good text, wrong/no candidates).
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
                      {r.ocr_char_count ?? 0} chars · pool {r.pool_size ?? 0}
                      {r.justtcg_appended ? ` · +${r.justtcg_appended} JustTCG` : ""}
                      {r.image_bytes ? ` · ${Math.round(r.image_bytes / 1024)}KB` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-foreground-muted truncate">
                    candidates: {(r.name_candidates ?? []).join(", ") || "—"}
                  </p>
                </summary>

                <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs">
                  {r.image_path && signed.get(r.image_path) && (
                    <div>
                      <p className="font-semibold text-foreground mb-1">Scanned image (what OCR saw)</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={signed.get(r.image_path)} alt="Scanned card" className="h-64 w-auto rounded-lg border border-border" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-foreground mb-1">Name candidates</p>
                    <p className="text-foreground-muted break-words">{(r.name_candidates ?? []).join(", ") || "—"}</p>
                    <p className="text-foreground-muted mt-0.5">
                      number — reliable: <span className={r.reliable_number ? "text-green-400" : ""}>{r.reliable_number ?? "—"}</span>
                      {" · "}hints: {(r.number_hints ?? []).join(", ") || "—"}
                      {" · "}all: {r.extracted_number ?? "—"}
                    </p>
                  </div>

                  {top.length > 0 && (
                    <div>
                      <p className="font-semibold text-foreground mb-1">Top ranked (pokemontcg.io)</p>
                      <div className="space-y-0.5 text-foreground-muted">
                        {top.map((t, i) => (
                          <p key={i} className="truncate">{t.score} · {t.name} · {t.set} #{t.number}</p>
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

                  <div>
                    <p className="font-semibold text-foreground mb-1">Raw OCR text</p>
                    <pre className="whitespace-pre-wrap break-words rounded-lg bg-surface-raised p-2 text-foreground-muted max-h-64 overflow-auto">
                      {r.ocr_text || "(nothing read)"}
                    </pre>
                  </div>

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
