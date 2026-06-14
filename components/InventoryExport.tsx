"use client";

import { buildCsv, downloadCsv, type CsvColumn } from "@/lib/exportCsv";

export interface ExportRow {
  date_added:  string;          // ISO
  name:        string;
  set_name:    string;
  card_number: string;
  game:        string;
  rarity:      string;
  variant:     string;
  finish:      string;
  condition:   string;          // labeled, e.g. "Near Mint" or "PSA 10"
  cert_number: string;
  quantity:    number;
  paid_unit:   number | null;   // per-copy purchase price
  market_unit: number | null;   // per-copy current market price
  list_unit:   number | null;   // per-copy list price
  for_sale:    boolean;
  for_trade:   boolean;
  notes:       string;
}

// Plain, spreadsheet-friendly formatting (no "$", ISO dates) so the output
// drops cleanly into tax/insurance worksheets.
const money = (n: number | null): string => (n == null ? "" : n.toFixed(2));
const isoDate = (iso: string): string => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const total = (unit: number | null, qty: number): string => (unit == null ? "" : (unit * qty).toFixed(2));
const gainLoss = (r: ExportRow): string =>
  r.paid_unit == null || r.market_unit == null ? "" : ((r.market_unit - r.paid_unit) * r.quantity).toFixed(2);

type Preset = {
  key:         string;
  label:       string;
  description: string;
  filename:    string;
  columns:     CsvColumn<ExportRow>[];
};

const PRESETS: Preset[] = [
  {
    key:         "full",
    label:       "Full export",
    description: "Every field for every card — the complete record of your collection.",
    filename:    "inventory",
    columns: [
      { header: "Date Added",         value: (r) => isoDate(r.date_added) },
      { header: "Card Name",          value: (r) => r.name },
      { header: "Set",                value: (r) => r.set_name },
      { header: "Number",             value: (r) => r.card_number },
      { header: "Game",               value: (r) => r.game },
      { header: "Rarity",             value: (r) => r.rarity },
      { header: "Variant",            value: (r) => r.variant },
      { header: "Finish",             value: (r) => r.finish },
      { header: "Condition / Grade",  value: (r) => r.condition },
      { header: "Cert #",             value: (r) => r.cert_number },
      { header: "Quantity",           value: (r) => String(r.quantity) },
      { header: "Unit Purchase Price",value: (r) => money(r.paid_unit) },
      { header: "Unit Market Price",  value: (r) => money(r.market_unit) },
      { header: "Unit List Price",    value: (r) => money(r.list_unit) },
      { header: "Total Cost Basis",   value: (r) => total(r.paid_unit, r.quantity) },
      { header: "Total Market Value", value: (r) => total(r.market_unit, r.quantity) },
      { header: "For Sale",           value: (r) => (r.for_sale ? "Yes" : "No") },
      { header: "For Trade",          value: (r) => (r.for_trade ? "Yes" : "No") },
      { header: "Notes",              value: (r) => r.notes },
    ],
  },
  {
    key:         "tax",
    label:       "Tax / cost-basis",
    description: "Acquisition date, cost basis, current value, and unrealized gain/loss — structured for capital-gains worksheets.",
    filename:    "inventory-tax",
    columns: [
      { header: "Card Name",            value: (r) => r.name },
      { header: "Set",                  value: (r) => r.set_name },
      { header: "Number",               value: (r) => r.card_number },
      { header: "Condition / Grade",    value: (r) => r.condition },
      { header: "Cert #",               value: (r) => r.cert_number },
      { header: "Quantity",             value: (r) => String(r.quantity) },
      { header: "Date Acquired",        value: (r) => isoDate(r.date_added) },
      { header: "Cost Basis",           value: (r) => total(r.paid_unit, r.quantity) },
      { header: "Current Market Value", value: (r) => total(r.market_unit, r.quantity) },
      { header: "Unrealized Gain/Loss", value: (r) => gainLoss(r) },
      { header: "Listed For Sale",      value: (r) => (r.for_sale ? "Yes" : "No") },
    ],
  },
  {
    key:         "insurance",
    label:       "Insurance inventory",
    description: "Item identification and current replacement value for each card — formatted for an insurance schedule.",
    filename:    "inventory-insurance",
    columns: [
      { header: "Card Name",               value: (r) => r.name },
      { header: "Set",                     value: (r) => r.set_name },
      { header: "Number",                  value: (r) => r.card_number },
      { header: "Game",                    value: (r) => r.game },
      { header: "Rarity",                  value: (r) => r.rarity },
      { header: "Variant",                 value: (r) => r.variant },
      { header: "Finish",                  value: (r) => r.finish },
      { header: "Condition / Grade",       value: (r) => r.condition },
      { header: "Cert #",                  value: (r) => r.cert_number },
      { header: "Quantity",                value: (r) => String(r.quantity) },
      { header: "Unit Replacement Value",  value: (r) => money(r.market_unit) },
      { header: "Total Replacement Value", value: (r) => total(r.market_unit, r.quantity) },
      { header: "Date Acquired",           value: (r) => isoDate(r.date_added) },
    ],
  },
];

const DOWNLOAD_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export function InventoryExport({ rows, username }: { rows: ExportRow[]; username: string }) {
  const date = new Date().toISOString().slice(0, 10);

  function handleExport(preset: Preset) {
    const csv = buildCsv(rows, preset.columns);
    downloadCsv(`vaultset-${preset.filename}-${username}-${date}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-muted">
        {rows.length} card{rows.length === 1 ? "" : "s"} ready to export. Choose a format:
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        {PRESETS.map((preset) => (
          <div
            key={preset.key}
            className="flex flex-col rounded-2xl border border-border bg-surface p-5"
          >
            <h2 className="font-semibold text-foreground">{preset.label}</h2>
            <p className="mt-1 flex-1 text-sm text-foreground-muted leading-relaxed">{preset.description}</p>
            <button
              type="button"
              onClick={() => handleExport(preset)}
              disabled={rows.length === 0}
              className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-background hover:bg-gold-light transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              {DOWNLOAD_ICON}
              Download CSV
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-foreground-muted leading-relaxed">
        Tax and insurance formats are convenience exports of your own data — Vaultset does not provide
        tax, accounting, or insurance advice. Market values reflect current TCGPlayer prices and are estimates,
        not appraisals. Confirm figures with a qualified professional before filing or insuring.
      </p>
    </div>
  );
}
