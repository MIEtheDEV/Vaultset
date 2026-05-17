import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";
import { PRODUCT_TYPE_LABEL } from "@/lib/products";
import { ReportActions } from "@/components/ReportActions";
import { ReportSortSelect } from "@/components/ReportSortSelect";
import { Suspense } from "react";

const raritySystem = new PokemonRaritySystem();

const CONDITION_LABEL: Record<string, string> = {
  mint: "Mint", near_mint: "Near Mint", lightly_played: "Lightly Played",
  moderately_played: "Moderately Played", heavily_played: "Heavily Played", damaged: "Damaged",
};
const FINISH_LABEL: Record<string, string> = {
  non_holo: "Non-Holo", holofoil: "Holofoil", reverse_holofoil: "Reverse Holofoil",
  textured_holofoil: "Textured Holofoil", gold_etched: "Gold Etched",
};
const VARIANT_LABEL: Record<string, string> = {
  standard_ex: "Standard ex", full_art: "Full Art",
  illustration_rare: "Illustration Rare (Alt Art)", special_illustration_rare: "Special Illustration Rare (Alt Art ex)",
  gold_card: "Gold Card", secret_rare: "Secret Rare", standard_holo: "Standard Holo",
  standard_v: "Standard V", vmax: "VMAX", vstar: "VSTAR",
  rainbow_rare: "Rainbow Rare", shiny_rare: "Shiny Rare", shiny_gx: "Shiny GX", ace_spec: "ACE SPEC",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort = "name_asc" } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const username    = user.user_metadata?.username as string;
  const generatedAt = new Date().toISOString();

  // Product purchases with their linked cards
  const { data: products } = await supabase
    .from("product_purchases")
    .select(`
      id, name, product_type, cost, list_price, status, for_sale, for_trade, purchased_at,
      collection_items ( id, quantity, list_price, cards ( name, set_name ) )
    `)
    .eq("user_id", user.id)
    .order("purchased_at", { ascending: false });

  const { data: items } = await supabase
    .from("collection_items")
    .select(`
      id, condition, finish, quantity, paid_price, list_price,
      for_sale, for_trade, grader, grade, cert_number, notes, created_at,
      cards ( game, name, set_name, card_number, game_data )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const totalCards    = items?.reduce((sum, i) => sum + (i.quantity ?? 1), 0) ?? 0;
  // All prices multiplied by quantity (per-unit × copies owned)
  const totalInvested = items?.reduce((sum, i) =>
    sum + (i.paid_price != null ? Number(i.paid_price) * (i.quantity ?? 1) : 0), 0) ?? 0;
  const listedValue   = items?.reduce((sum, i) =>
    sum + (i.list_price != null ? Number(i.list_price) * (i.quantity ?? 1) : 0), 0) ?? 0;
  // P/L only on cards where both prices are known
  const profitLoss    = items?.reduce((sum, i) => {
    if (i.paid_price == null || i.list_price == null) return sum;
    return sum + (Number(i.list_price) - Number(i.paid_price)) * (i.quantity ?? 1);
  }, 0) ?? 0;
  // Sealed product totals — folded into the combined summary
  const sealedInvestedAll = (products ?? []).reduce((sum, p) => sum + Number(p.cost), 0);

  // Listed value: for_sale products use list_price; opened products use linked card pull values
  const sealedListedValue = (products ?? []).reduce((sum, p) => {
    if ((p as any).for_sale && (p as any).list_price != null) {
      return sum + Number((p as any).list_price);
    }
    if ((p as any).status === "opened") {
      const linked = ((p as any).collection_items ?? []) as any[];
      const pull   = linked.reduce((s: number, c: any) =>
        s + (c.list_price != null ? Number(c.list_price) * (c.quantity ?? 1) : 0), 0);
      return sum + pull;
    }
    return sum;
  }, 0);

  const sealedForSale = (products ?? []).filter((p) => (p as any).for_sale);
  const sealedPL      = sealedListedValue - sealedInvestedAll;

  // Combined totals — simple arithmetic, no card-product linkage needed
  const combinedInvested = totalInvested + sealedInvestedAll;
  const combinedListed   = listedValue   + sealedListedValue;
  const combinedPL       = combinedListed - combinedInvested;
  const returnPct        = combinedInvested > 0 ? (combinedPL / combinedInvested) * 100 : 0;

  const rows = (items ?? []).map((item) => {
    const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
    const gd   = (card?.game_data ?? {}) as Record<string, unknown>;
    return {
      date_added:  item.created_at,
      name:        card?.name ?? "—",
      set_name:    card?.set_name ?? "—",
      card_number: card?.card_number ?? "—",
      game:        card?.game ?? "—",
      rarity:      raritySystem.getDisplayLabel((gd.rarity as string) ?? ""),
      variant:     VARIANT_LABEL[(gd.variant as string) ?? ""] ?? (gd.variant as string) ?? "—",
      finish:      FINISH_LABEL[item.finish ?? ""] ?? "—",
      condition:   item.grader
                     ? `${item.grader} ${item.grade}`
                     : CONDITION_LABEL[item.condition ?? ""] ?? "—",
      cert_number:  item.cert_number ?? "—",
      quantity:     item.quantity,
      // Display prices are quantity-adjusted totals (per-unit × qty)
      paid_price:   item.paid_price != null
                      ? `$${(Number(item.paid_price) * item.quantity).toFixed(2)}`
                      : "—",
      list_price:   item.list_price != null
                      ? `$${(Number(item.list_price) * item.quantity).toFixed(2)}`
                      : "—",
      // Per-card projected P/L (only when both prices are set)
      pl_raw:       item.paid_price != null && item.list_price != null
                      ? (Number(item.list_price) - Number(item.paid_price)) * item.quantity
                      : null,
      for_sale:     item.for_sale  ? "Yes" : "No",
      for_trade:    item.for_trade ? "Yes" : "No",
      notes:            item.notes ?? "—",
      // Raw values for sorting (per-unit, for consistent ordering)
      rarity_key:       (gd.rarity as string) ?? "",
      paid_price_raw:   item.paid_price != null ? Number(item.paid_price) * item.quantity : -1,
      list_price_raw:   item.list_price  != null ? Number(item.list_price)  * item.quantity : -1,
      date_added_raw:   item.created_at,
    };
  });

  // Apply sort
  const sorted = [...rows].sort((a, b) => {
    switch (sort) {
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "date_newest":
        return b.date_added_raw.localeCompare(a.date_added_raw);
      case "date_oldest":
        return a.date_added_raw.localeCompare(b.date_added_raw);
      case "rarity_high":
        return raritySystem.getSortOrder(a.rarity_key) - raritySystem.getSortOrder(b.rarity_key);
      case "price_purchase_high":
        return b.paid_price_raw - a.paid_price_raw;
      case "price_list_high":
        return b.list_price_raw - a.list_price_raw;
      default: // name_asc
        return a.name.localeCompare(b.name);
    }
  });

  const ALL_COLUMNS = [
    { key: "date_added"  as const, label: "Date Added" },
    { key: "name"        as const, label: "Card Name" },
    { key: "set_name"    as const, label: "Set" },
    { key: "card_number" as const, label: "#" },
    { key: "game"        as const, label: "Game" },
    { key: "rarity"      as const, label: "Rarity" },
    { key: "variant"     as const, label: "Variant" },
    { key: "finish"      as const, label: "Finish" },
    { key: "condition"   as const, label: "Condition / Grade" },
    { key: "cert_number" as const, label: "Cert #" },
    { key: "quantity"    as const, label: "Qty" },
    { key: "paid_price"  as const, label: "Purchase Price" },
    { key: "list_price"  as const, label: "List Price" },
    { key: "for_sale"    as const, label: "For Sale" },
    { key: "for_trade"   as const, label: "For Trade" },
    { key: "notes"       as const, label: "Notes" },
  ];

  return (
    <div className="space-y-6">

      {/* Screen-only header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-foreground-muted hover:text-foreground transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Collection Report</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">
              @{username} · Generated {formatDateTime(generatedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-3 w-full sm:w-auto">
          <Suspense>
            <ReportSortSelect />
          </Suspense>
          <ReportActions rows={sorted} columns={ALL_COLUMNS} username={username} generatedAt={generatedAt} />
        </div>
      </div>

      {/* Report title block */}
      <div className="rounded-2xl border border-border bg-surface px-6 py-5 print:border print:border-gray-400 print:rounded-none print:mb-4">
        <h2 className="text-xl font-bold text-foreground print:text-black print:text-2xl">
          Vaultset — Collection Report
        </h2>
        <div className="mt-2 space-y-1 text-sm text-foreground-muted print:text-gray-600">
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <span>Collector: <span className="font-semibold text-foreground print:text-black">@{username}</span></span>
            <span>Generated: <span className="font-semibold text-foreground print:text-black">{formatDateTime(generatedAt)}</span></span>
            <span>Total Cards: <span className="font-semibold text-foreground print:text-black">{totalCards}</span></span>
            <span>Entries: <span className="font-semibold text-foreground print:text-black">{rows.length}</span></span>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <span>
              Total Invested:{" "}
              <span className="font-semibold text-foreground print:text-black">${combinedInvested.toFixed(2)}</span>
              <span className="ml-1 text-xs italic print:text-gray-400"> (cards + sealed products)</span>
            </span>
            <span>
              Listed Value:{" "}
              <span className="font-semibold text-gold print:text-black">${combinedListed.toFixed(2)}</span>
              <span className="ml-1 text-xs italic print:text-gray-400"> (listed cards + sealed for sale — market values in a future update)</span>
            </span>
            <span>
              Projected Profit / Loss:{" "}
              <span className={`font-semibold print:text-black ${
                combinedPL > 0 ? "text-emerald-400" : combinedPL < 0 ? "text-red-400" : "text-foreground"
              }`}>
                {combinedPL >= 0 ? "+" : ""}${combinedPL.toFixed(2)}
              </span>
              <span className={`ml-2 text-xs font-medium print:text-black ${
                returnPct > 0 ? "text-emerald-400" : returnPct < 0 ? "text-red-400" : "text-foreground-muted"
              }`}>
                ({returnPct >= 0 ? "+" : ""}{returnPct.toFixed(1)}%)
              </span>
              <span className="ml-1.5 text-xs italic text-foreground-muted print:text-gray-400"> (will reflect market values in a future update)</span>
            </span>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-6 py-16 text-center text-sm text-foreground-muted print:hidden">
          No cards in your vault yet.
        </div>
      ) : (
        <div className="space-y-4 print:space-y-3">
          {sorted.map((row, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-surface overflow-hidden print:border print:border-gray-400 print:rounded-none"
              style={{ breakInside: "avoid" }}
            >
              {/* Card title */}
              <div className="px-5 py-3 bg-surface-raised border-b border-border print:bg-gray-50 print:border-b print:border-gray-300">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-foreground print:text-black">
                      {row.name}
                    </p>
                    <p className="text-xs text-foreground-muted mt-0.5 print:text-gray-500">
                      {row.set_name}
                      {row.card_number !== "—" ? ` · #${row.card_number}` : ""}
                      {" · "}
                      <span className="capitalize">{row.game}</span>
                    </p>
                    {(row.rarity !== "" || row.variant !== "—" || row.finish !== "—") && (
                      <p className="text-xs text-foreground-muted mt-0.5 print:text-gray-500">
                        {[row.rarity, row.variant, row.finish].filter(v => v && v !== "—").join(" · ")}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted whitespace-nowrap flex-shrink-0 print:text-gray-500">
                    Added {formatDate(row.date_added)}
                  </p>
                </div>
              </div>

              {/* Detail row — mobile */}
              <div className="sm:hidden print:hidden px-5 py-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-border">
                <div>
                  <p className="text-xs text-foreground-muted">Condition</p>
                  <p className="text-foreground">{row.condition}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">Qty</p>
                  <p className="text-foreground">{row.quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">Purchase Price</p>
                  <p className="text-foreground">{row.paid_price}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">List Price</p>
                  <p className="text-foreground">{row.list_price}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">Proj. P/L</p>
                  <p className={`font-medium ${
                    row.pl_raw == null ? "text-foreground-muted" :
                    row.pl_raw > 0 ? "text-emerald-400" : row.pl_raw < 0 ? "text-red-400" : "text-foreground"
                  }`}>
                    {row.pl_raw == null ? "—" : `${row.pl_raw >= 0 ? "+" : ""}$${row.pl_raw.toFixed(2)}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">For Sale / Trade</p>
                  <p className="text-foreground">{row.for_sale} / {row.for_trade}</p>
                </div>
                {row.cert_number !== "—" && (
                  <div>
                    <p className="text-xs text-foreground-muted">Cert #</p>
                    <p className="text-foreground">{row.cert_number}</p>
                  </div>
                )}
              </div>

              {/* Detail row — desktop */}
              <table className="w-full text-sm print:text-xs hidden sm:table print:table">
                <thead>
                  <tr className="border-b border-border print:border-gray-200">
                    {[
                      "Condition / Grade", "Cert #", "Qty",
                      "Purchase Price", "List Price", "Proj. P/L",
                      "For Sale", "For Trade",
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-4 py-2 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wide whitespace-nowrap print:text-gray-500 print:py-1.5"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2.5 text-foreground print:text-black print:py-2">{row.condition}</td>
                    <td className="px-4 py-2.5 text-foreground-muted print:text-gray-600 print:py-2">{row.cert_number}</td>
                    <td className="px-4 py-2.5 text-foreground print:text-black print:py-2">{row.quantity}</td>
                    <td className="px-4 py-2.5 text-foreground print:text-black print:py-2">{row.paid_price}</td>
                    <td className="px-4 py-2.5 text-foreground print:text-black print:py-2">{row.list_price}</td>
                    <td className={`px-4 py-2.5 font-medium print:py-2 print:text-black ${
                      row.pl_raw == null ? "text-foreground-muted" :
                      row.pl_raw > 0 ? "text-emerald-400" : row.pl_raw < 0 ? "text-red-400" : "text-foreground"
                    }`}>
                      {row.pl_raw == null ? "—" : `${row.pl_raw >= 0 ? "+" : ""}$${row.pl_raw.toFixed(2)}`}
                    </td>
                    <td className="px-4 py-2.5 text-foreground print:text-black print:py-2">{row.for_sale}</td>
                    <td className="px-4 py-2.5 text-foreground print:text-black print:py-2">{row.for_trade}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Product Investments */}
      {products && products.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-foreground print:text-black">Product Investments</h2>
          <div className="rounded-2xl border border-border bg-surface overflow-hidden print:border print:border-gray-400 print:rounded-none">

            {/* Mobile product list */}
            <div className="sm:hidden print:hidden divide-y divide-border">
              {products.map((product) => {
                const status   = (product as any).status ?? "sealed";
                const forSale  = !!(product as any).for_sale;
                const forTrade = !!(product as any).for_trade;
                const askPrice = (product as any).list_price != null ? Number((product as any).list_price) : null;
                const cost      = Number(product.cost);
                const linked    = (product.collection_items ?? []) as any[];
                const pullValue = linked.reduce((sum: number, c: any) =>
                  sum + (c.list_price != null ? Number(c.list_price) * (c.quantity ?? 1) : 0), 0);
                const listDisplay = forSale && askPrice != null
                  ? `$${askPrice.toFixed(2)}`
                  : status === "opened" && pullValue > 0
                    ? `$${pullValue.toFixed(2)} (pull)`
                    : "—";
                const pl: number | null = forSale && askPrice != null
                  ? askPrice - cost
                  : status === "opened" && pullValue > 0
                    ? pullValue - cost
                    : null;
                return (
                  <div key={product.id} className="px-4 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">{product.name}</p>
                        <p className="text-xs text-foreground-muted mt-0.5">
                          {new Date(product.purchased_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      {status === "opened"
                        ? <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted shrink-0">Opened</span>
                        : <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 shrink-0">Sealed</span>
                      }
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <p className="text-xs text-foreground-muted">Purchase Price</p>
                        <p className="text-foreground">${cost.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-foreground-muted">List Price</p>
                        <p className="text-foreground">{listDisplay}</p>
                      </div>
                      <div>
                        <p className="text-xs text-foreground-muted">Proj. P/L</p>
                        <p className={`font-medium ${pl == null ? "text-foreground-muted" : pl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {pl == null ? "—" : `${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-foreground-muted">For Sale / Trade</p>
                        <p className="text-foreground">{forSale ? "Yes" : "No"} / {forTrade ? "Yes" : "No"}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop product table */}
            <table className="w-full text-sm print:text-xs hidden sm:table print:table">
              <thead>
                <tr className="border-b border-border bg-surface-raised print:bg-gray-100">
                  {["Product", "Date", "Status", "Purchase Price", "List Price", "Proj. P/L", "For Sale", "For Trade"].map((label) => (
                    <th key={label} className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wide whitespace-nowrap print:text-gray-700 print:py-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border print:divide-gray-200">
                {products.map((product) => {
                  const status   = (product as any).status ?? "sealed";
                  const forSale  = !!(product as any).for_sale;
                  const forTrade = !!(product as any).for_trade;
                  const askPrice = (product as any).list_price != null ? Number((product as any).list_price) : null;
                  const cost      = Number(product.cost);
                  const linked    = (product.collection_items ?? []) as any[];
                  const pullValue = linked.reduce((sum: number, c: any) =>
                    sum + (c.list_price != null ? Number(c.list_price) * (c.quantity ?? 1) : 0), 0);
                  const listDisplay = forSale && askPrice != null
                    ? `$${askPrice.toFixed(2)}`
                    : status === "opened" && pullValue > 0
                      ? `$${pullValue.toFixed(2)} (pull value)`
                      : "—";
                  const pl: number | null = forSale && askPrice != null
                    ? askPrice - cost
                    : status === "opened" && pullValue > 0
                      ? pullValue - cost
                      : null;
                  return (
                    <tr key={product.id} className="hover:bg-surface-raised transition-colors print:hover:bg-transparent">
                      <td className="px-4 py-2.5 font-medium text-foreground print:text-black">{product.name}</td>
                      <td className="px-4 py-2.5 text-foreground-muted print:text-gray-600 whitespace-nowrap">
                        {new Date(product.purchased_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {status === "opened"
                          ? <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted">Opened</span>
                          : <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">Sealed</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-foreground print:text-black">${cost.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-foreground print:text-black">{listDisplay}</td>
                      <td className={`px-4 py-2.5 font-medium print:text-black ${
                        pl == null ? "text-foreground-muted" : pl >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {pl == null ? "—" : `${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}`}
                      </td>
                      <td className="px-4 py-2.5 text-foreground print:text-black">{forSale  ? "Yes" : "No"}</td>
                      <td className="px-4 py-2.5 text-foreground print:text-black">{forTrade ? "Yes" : "No"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Print footer */}
      <div className="hidden print:block text-xs text-gray-400 pt-4 border-t border-gray-200 text-center">
        © 2026 Vaultset · vaultset.app · {formatDateTime(generatedAt)}
      </div>

    </div>
  );
}
