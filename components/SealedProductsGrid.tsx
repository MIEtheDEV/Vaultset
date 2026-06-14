"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PRODUCT_TYPE_LABEL } from "@/lib/products";
import { ProSellerBadge } from "@/components/ProBadge";

export interface SealedListing {
  id:              string;
  user_id:         string;
  seller_username: string;
  name:            string;
  product_type:    string;
  cost:            number;
  for_sale:        boolean;
  for_trade:       boolean;
  list_price:      number | null;
  purchased_at:    string;
  notes:           string | null;
}

type SortKey = "newest" | "price_asc" | "price_desc" | "name_asc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest",     label: "Recently Listed" },
  { key: "price_asc",  label: "Price (low – high)" },
  { key: "price_desc", label: "Price (high – low)" },
  { key: "name_asc",   label: "Name (A – Z)" },
];

export function SealedProductsGrid({
  listings,
  currentUserId,
  proSellerIds = [],
}: {
  listings:      SealedListing[];
  currentUserId: string;
  proSellerIds?: string[];
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort]     = useState<SortKey>("newest");
  const proSellerSet = useMemo(() => new Set(proSellerIds), [proSellerIds]);

  const visible = useMemo(() => {
    let result = [...listings];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((l) => l.name.toLowerCase().includes(q));
    }
    if (sort === "price_asc")  result.sort((a, b) => (a.list_price ?? Infinity) - (b.list_price ?? Infinity));
    if (sort === "price_desc") result.sort((a, b) => (b.list_price ?? -Infinity) - (a.list_price ?? -Infinity));
    if (sort === "name_asc")   result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [listings, search, sort]);

  if (listings.length === 0) return null;

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted pointer-events-none">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search sealed products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface-raised pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-xs text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
        >
          {SORTS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-10 text-center">
          <p className="text-sm text-foreground-muted">No sealed products match your search.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map((item) => {
            const isOwn = item.user_id === currentUserId;
            return (
              <div key={item.id} className="group rounded-2xl border border-border bg-surface hover:border-gold/30 hover:bg-surface-raised transition-all duration-200 flex flex-col">

                {/* Header */}
                <div className="p-4 border-b border-border space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground leading-tight">{item.name}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      {item.for_sale  && <span className="rounded-full bg-gold/90 px-2 py-0.5 text-xs font-semibold text-background">Sale</span>}
                      {item.for_trade && <span className="rounded-full bg-blue-400/90 px-2 py-0.5 text-xs font-semibold text-background">Trade</span>}
                    </div>
                  </div>
                  <span className="inline-block rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted">
                    {PRODUCT_TYPE_LABEL[item.product_type] ?? item.product_type}
                  </span>
                </div>

                {/* Body */}
                <div className="p-4 flex flex-col flex-1 gap-3">
                  {item.notes && (
                    <p className="text-xs text-foreground-muted leading-relaxed line-clamp-2">{item.notes}</p>
                  )}

                  <div className="mt-auto space-y-3">
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-xs text-foreground-muted">
                        {isOwn
                          ? <span className="text-gold font-medium">Your listing</span>
                          : (
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              <span>by <Link href={`/profile/${item.seller_username}`} className="text-foreground hover:text-gold transition-colors">@{item.seller_username}</Link></span>
                              {proSellerSet.has(item.user_id) && <ProSellerBadge />}
                            </span>
                          )
                        }
                      </span>
                      {item.for_sale && item.list_price != null ? (
                        <span className="text-base font-bold text-gold">${Number(item.list_price).toFixed(2)}</span>
                      ) : item.for_trade && !item.for_sale ? (
                        <span className="text-xs font-medium text-blue-400">Open to Trade</span>
                      ) : (
                        <span className="text-xs text-foreground-muted">Trade + Sale</span>
                      )}
                    </div>

                    {isOwn ? (
                      <Link
                        href={`/inventory/products/${item.id}/edit`}
                        className="block text-center rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
                      >
                        Edit Listing
                      </Link>
                    ) : (
                      <div className="rounded-xl border border-border px-4 py-2 text-center text-xs text-foreground-muted">
                        Transactions <span className="font-medium text-gold">Coming Soon</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
