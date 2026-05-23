"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SORT_OPTIONS = [
  { value: "name_asc",            label: "Name (A – Z)" },
  { value: "name_desc",           label: "Name (Z – A)" },
  { value: "date_newest",         label: "Date Added (newest first)" },
  { value: "date_oldest",         label: "Date Added (oldest first)" },
  { value: "rarity_high",         label: "Rarity (highest first)" },
  { value: "price_purchase_high", label: "Purchase Price (high – low)" },
  { value: "price_market_high",  label: "Market Price (high – low)" },
  { value: "price_list_high",    label: "List Price (high – low)" },
];

export function ReportSortSelect() {
  const router     = useRouter();
  const params     = useSearchParams();
  const current    = params.get("sort") ?? "name_asc";

  function handleChange(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("sort", value);
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <label className="text-sm text-foreground-muted whitespace-nowrap">Sort by</label>
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        className="flex-1 sm:flex-none rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
      >
        {SORT_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>
  );
}
