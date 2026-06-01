"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import { createClient } from "@/utils/supabase/client";

// CSV column mapping (case-insensitive header matching)
const COLUMN_MAP: Record<string, string> = {
  name:      "name",
  card_name: "name",
  set:       "set_name",
  set_name:  "set_name",
  number:    "card_number",
  card_number: "card_number",
  condition: "condition",
  finish:    "finish",
  quantity:  "quantity",
  qty:       "quantity",
  paid:      "paid_price",
  paid_price: "paid_price",
  price_paid: "paid_price",
  list_price:  "list_price",
  for_sale:    "for_sale",
  for_trade:   "for_trade",
  notes:     "notes",
};

const CONDITION_MAP: Record<string, string> = {
  mint: "mint", m: "mint",
  "near mint": "near_mint", nm: "near_mint", "near_mint": "near_mint",
  "lightly played": "lightly_played", lp: "lightly_played", "lightly_played": "lightly_played",
  "moderately played": "moderately_played", mp: "moderately_played", "moderately_played": "moderately_played",
  "heavily played": "heavily_played", hp: "heavily_played", "heavily_played": "heavily_played",
  damaged: "damaged", d: "damaged",
};

interface ParsedRow {
  name: string;
  set_name: string;
  card_number?: string;
  condition?: string;
  finish?: string;
  quantity: number;
  paid_price?: number;
  list_price?: number;
  for_sale: boolean;
  for_trade: boolean;
  notes?: string;
  _error?: string;
}

function normalizeRow(raw: Record<string, string>): ParsedRow {
  const mapped: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const normalized = COLUMN_MAP[k.trim().toLowerCase().replace(/\s+/g, "_")];
    if (normalized) mapped[normalized] = v.trim();
  }

  const name = mapped.name ?? "";
  const set_name = mapped.set_name ?? "";

  if (!name) return { name: "", set_name: "", quantity: 1, for_sale: false, for_trade: false, _error: "Missing card name" };

  const rawCondition = mapped.condition?.toLowerCase() ?? "";
  const condition    = CONDITION_MAP[rawCondition] ?? (rawCondition || undefined);

  return {
    name,
    set_name,
    card_number: mapped.card_number || undefined,
    condition,
    finish: mapped.finish || undefined,
    quantity:   Math.max(1, parseInt(mapped.quantity ?? "1", 10) || 1),
    paid_price: mapped.paid_price ? parseFloat(mapped.paid_price) || undefined : undefined,
    list_price: mapped.list_price ? parseFloat(mapped.list_price) || undefined : undefined,
    for_sale:  ["true", "yes", "1"].includes((mapped.for_sale ?? "").toLowerCase()),
    for_trade: ["true", "yes", "1"].includes((mapped.for_trade ?? "").toLowerCase()),
    notes: mapped.notes || undefined,
  };
}

export default function ImportPage() {
  const router    = useRouter();
  const fileRef   = useRef<HTMLInputElement>(null);

  const [rows,    setRows]    = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState("");

  function handleFile(file: File) {
    setFileName(file.name);
    setRows([]);
    setError("");
    setDone(false);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const parsed = results.data.map(normalizeRow);
        setRows(parsed);
      },
      error(err) {
        setError(`Failed to parse file: ${err.message}`);
      },
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    setLoading(true);
    setError("");
    setProgress(0);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const validRows = rows.filter((r) => !r._error && r.name);
    let imported = 0;

    for (const row of validRows) {
      // Upsert card record
      const { data: card, error: cardError } = await supabase
        .from("cards")
        .insert({
          game:        "pokemon",
          name:        row.name,
          set_name:    row.set_name || null,
          card_number: row.card_number || null,
          game_data:   {},
        })
        .select("id")
        .single();

      if (cardError || !card) {
        // Card might already exist — try to find it
        const { data: existing } = await supabase
          .from("cards")
          .select("id")
          .eq("name", row.name)
          .eq("set_name", row.set_name ?? "")
          .maybeSingle();

        if (!existing) { imported++; setProgress(Math.round((imported / validRows.length) * 100)); continue; }

        await supabase.from("collection_items").insert({
          user_id:    user.id,
          card_id:    existing.id,
          condition:  row.condition   ?? null,
          finish:     row.finish      ?? null,
          quantity:   row.quantity,
          paid_price: row.paid_price  ?? null,
          list_price: row.list_price  ?? null,
          for_sale:   row.for_sale,
          for_trade:  row.for_trade,
          notes:      row.notes       ?? null,
        });
      } else {
        await supabase.from("collection_items").insert({
          user_id:    user.id,
          card_id:    card.id,
          condition:  row.condition   ?? null,
          finish:     row.finish      ?? null,
          quantity:   row.quantity,
          paid_price: row.paid_price  ?? null,
          list_price: row.list_price  ?? null,
          for_sale:   row.for_sale,
          for_trade:  row.for_trade,
          notes:      row.notes       ?? null,
        });
      }

      imported++;
      setProgress(Math.round((imported / validRows.length) * 100));
    }

    setLoading(false);
    setDone(true);
  }

  const validCount  = rows.filter((r) => !r._error).length;
  const errorCount  = rows.filter((r) => !!r._error).length;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import Collection</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Upload a CSV file to bulk-import cards into your vault.
          </p>
        </div>
        <Link href="/inventory" className="text-sm text-foreground-muted hover:text-foreground transition-colors">
          ← Inventory
        </Link>
      </div>

      {done ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center space-y-4">
          <p className="text-lg font-semibold text-emerald-400">Import complete</p>
          <p className="text-sm text-foreground-muted">{validCount} card{validCount !== 1 ? "s" : ""} added to your vault.</p>
          <Link
            href="/inventory"
            className="inline-block rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
          >
            View Inventory
          </Link>
        </div>
      ) : (
        <>
          {/* CSV format guide */}
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">Expected CSV format</p>
            <p className="text-xs text-foreground-muted">
              First row must be a header. Supported columns (case-insensitive):
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-raised">
                  <tr>
                    {["name *", "set", "number", "condition", "finish", "quantity", "paid", "list_price", "for_sale", "for_trade", "notes"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-foreground-muted font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    {["Pikachu", "Base Set", "58", "near_mint", "holofoil", "1", "12.50", "", "false", "true", ""].map((v, i) => (
                      <td key={i} className="px-3 py-2 text-foreground-muted whitespace-nowrap">{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-foreground-muted">* Required. Condition values: mint, near_mint (or nm), lightly_played (lp), moderately_played (mp), heavily_played (hp), damaged.</p>
          </div>

          {/* File drop zone */}
          {rows.length === 0 && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="rounded-2xl border-2 border-dashed border-border bg-surface hover:border-gold/40 transition-colors cursor-pointer py-16 flex flex-col items-center gap-3"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Drop CSV file here</p>
                <p className="text-xs text-foreground-muted mt-0.5">or click to browse</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-foreground">{fileName}</p>
                  <p className="text-xs text-foreground-muted mt-0.5">
                    {validCount} valid row{validCount !== 1 ? "s" : ""}
                    {errorCount > 0 && <span className="text-red-400"> · {errorCount} skipped (missing name)</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setRows([]); setFileName(""); }}
                  className="text-xs text-foreground-muted hover:text-foreground transition-colors"
                >
                  Change file
                </button>
              </div>

              <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-raised border-b border-border">
                      <tr>
                        {["Name", "Set", "#", "Condition", "Qty", "Paid", "Sale", "Trade", "Status"].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left text-foreground-muted font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((row, i) => (
                        <tr key={i} className={row._error ? "opacity-40" : ""}>
                          <td className="px-3 py-2 text-foreground font-medium whitespace-nowrap max-w-[180px] truncate">{row.name || "—"}</td>
                          <td className="px-3 py-2 text-foreground-muted whitespace-nowrap max-w-[140px] truncate">{row.set_name || "—"}</td>
                          <td className="px-3 py-2 text-foreground-muted">{row.card_number || "—"}</td>
                          <td className="px-3 py-2 text-foreground-muted capitalize">{row.condition?.replace(/_/g, " ") || "—"}</td>
                          <td className="px-3 py-2 text-foreground-muted">{row.quantity}</td>
                          <td className="px-3 py-2 text-foreground-muted">{row.paid_price != null ? `$${row.paid_price.toFixed(2)}` : "—"}</td>
                          <td className="px-3 py-2 text-foreground-muted">{row.for_sale ? "Yes" : "No"}</td>
                          <td className="px-3 py-2 text-foreground-muted">{row.for_trade ? "Yes" : "No"}</td>
                          <td className="px-3 py-2">
                            {row._error
                              ? <span className="text-red-400">Skip: {row._error}</span>
                              : <span className="text-emerald-400">Import</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              {loading ? (
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
                    <div
                      className="h-full bg-gold transition-all duration-300 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-foreground-muted text-center">Importing… {progress}%</p>
                </div>
              ) : validCount > 0 ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleImport}
                    className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
                  >
                    Import {validCount} card{validCount !== 1 ? "s" : ""}
                  </button>
                  <Link
                    href="/inventory"
                    className="rounded-full border border-border px-8 py-3 text-sm font-semibold text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
                  >
                    Cancel
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">No valid rows to import.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
