"use client";

interface Row {
  date_added: string;
  name: string;
  set_name: string;
  card_number: string;
  game: string;
  rarity: string;
  variant: string;
  finish: string;
  condition: string;
  cert_number: string;
  quantity: number;
  paid_price: string;
  list_price: string;
  for_sale: string;
  for_trade: string;
  notes: string;
}

interface Column {
  readonly key: keyof Row;
  readonly label: string;
}

interface Props {
  rows:        Row[];
  columns:     readonly Column[];
  username:    string;
  generatedAt: string;
}

function toCSV(rows: Row[], columns: readonly Column[]): string {
  const escape = (val: string) =>
    `"${String(val).replace(/"/g, '""')}"`;

  const header = columns.map((c) => escape(c.label)).join(",");
  const body   = rows.map((row) =>
    columns.map((c) => escape(String(row[c.key]))).join(",")
  );

  return [header, ...body].join("\r\n");
}

export function ReportActions({ rows, columns, username, generatedAt }: Props) {
  function handlePrint() {
    window.print();
  }

  function handleCSV() {
    const csv      = toCSV(rows, columns);
    const date     = new Date(generatedAt).toISOString().slice(0, 10);
    const filename = `vaultset-report-${username}-${date}.csv`;
    const blob     = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url      = URL.createObjectURL(blob);
    const link     = document.createElement("a");
    link.href      = url;
    link.download  = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <button
        type="button"
        onClick={handleCSV}
        className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download CSV
      </button>
      <button
        type="button"
        onClick={handlePrint}
        className="flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Print
      </button>
    </div>
  );
}
