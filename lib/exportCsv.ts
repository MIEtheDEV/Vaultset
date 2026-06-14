export type CsvColumn<T> = { header: string; value: (row: T) => string };

/** Builds an RFC-4180-ish CSV string (CRLF rows, quoted + escaped fields). */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const escape = (val: string) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const header = columns.map((c) => escape(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escape(c.value(r))).join(","));
  return [header, ...body].join("\r\n");
}

/** Triggers a browser download of a CSV string. Client-only. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
