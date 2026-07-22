"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";

import { PRODUCT_TYPES, PRODUCT_TYPE_MSRP } from "@/lib/products";
import { SealedProductSearch } from "@/components/SealedProductSearch";
import type { SealedProductResult } from "@/lib/search/justTcgSearch";

function inputClass() {
  return "w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors";
}
function labelClass() {
  return "mb-1.5 block text-sm font-medium text-foreground-muted";
}
function selectClass() {
  return "w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors";
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="flex items-center gap-3">
      <span className={`relative flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors ${on ? "border-gold bg-gold" : "border-border bg-surface-raised"}`}>
        <span className={`h-4 w-4 rounded-full bg-background shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
      <span className="text-sm text-foreground-muted">{label}</span>
    </button>
  );
}

const STATUSES = [
  { value: "sealed", label: "Sealed", description: "Unopened — in the vault" },
  { value: "opened", label: "Opened", description: "Cracked open — cards have been pulled" },
];

interface Props {
  initial?: {
    id:           string;
    name:         string;
    product_type: string;
    cost:         number;
    purchased_at: string;
    notes:        string;
    status:    string;
    for_sale:  boolean;
    for_trade: boolean;
    list_price: number | null;
    tcgplayer_id: string | null;
    set_name:     string | null;
    image_url:    string | null;
    market_value: number | null;
  };
}

export function ProductForm({ initial }: Props) {
  const router  = useRouter();
  const isEdit  = !!initial;

  const [name,         setName]         = useState(initial?.name ?? "");
  const [productType,  setProductType]  = useState(initial?.product_type ?? "");
  const [cost,         setCost]         = useState(initial?.cost != null ? String(initial.cost) : "");
  const [purchasedAt,  setPurchasedAt]  = useState(initial?.purchased_at ?? new Date().toISOString().slice(0, 10));
  const [notes,        setNotes]        = useState(initial?.notes ?? "");
  const [status,    setStatus]    = useState(initial?.status ?? "sealed");
  const [forSale,   setForSale]   = useState(initial?.for_sale ?? false);
  const [forTrade,  setForTrade]  = useState(initial?.for_trade ?? false);
  const [listPrice, setListPrice] = useState(initial?.list_price != null ? String(initial.list_price) : "");

  // Market identity (from the JustTCG sealed-product picker). tcgplayerId is the
  // key we price by; marketValue is the current sealed market value we cache on
  // the row so it shows immediately and refreshes with the market.
  const [tcgplayerId, setTcgplayerId] = useState(initial?.tcgplayer_id ?? "");
  const [tcgSetName,  setTcgSetName]  = useState(initial?.set_name ?? "");
  const [imageUrl,    setImageUrl]    = useState(initial?.image_url ?? "");
  const [marketValue, setMarketValue] = useState<number | null>(initial?.market_value ?? null);
  // True once the user picks a product this session — only then do we (re)stamp
  // market_value_updated_at, so editing other fields doesn't fake a fresh price.
  const [pickedNow, setPickedNow] = useState(false);
  // True while "Cost Paid" holds an auto-filled MSRP estimate the user hasn't
  // edited — drives the note and lets a re-pick replace the stale estimate.
  const [costIsMsrp, setCostIsMsrp] = useState(false);

  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  // Once opened, the sealed market value no longer describes the product (the
  // box is cracked; its worth is the pulled singles, tracked separately). So we
  // never show, prefill from, or persist a sealed market value for opened items.
  const isOpened = status === "opened";

  function handleProductSelect(product: SealedProductResult) {
    setName(product.name);
    setTcgplayerId(product.tcgplayerId);
    setTcgSetName(product.setName);
    setImageUrl(product.image);
    setMarketValue(product.marketValue);
    // Auto-select the product type from the name when we can classify it; leave
    // whatever's set if we can't (user picks manually).
    const type = product.productType;
    if (type) setProductType(type);

    // Pre-fill Cost Paid with the type's standard MSRP as an editable estimate.
    // Only touch it when the field is empty or still holds a prior auto-MSRP —
    // never overwrite a cost the user actually typed.
    const msrp = type ? PRODUCT_TYPE_MSRP[type] : undefined;
    if (!cost || costIsMsrp) {
      if (msrp != null)      { setCost(String(msrp)); setCostIsMsrp(true); }
      else if (costIsMsrp)   { setCost("");           setCostIsMsrp(false); } // drop stale estimate
    }
    setPickedNow(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      name,
      product_type: productType,
      cost:         Number(cost),
      purchased_at: purchasedAt,
      notes:     notes || null,
      status,
      for_sale:  forSale,
      for_trade: forTrade,
      list_price: forSale && listPrice ? Number(listPrice) : null,
      tcgplayer_id: tcgplayerId || null,
      set_name:     tcgSetName  || null,
      image_url:    imageUrl    || null,
      // Cache the sealed market value at add-time (the picker already carried it,
      // so no extra request); market-refresh keeps it current afterwards. Opened
      // products carry NO sealed market value — it would be false (and would
      // double-count against the pulled singles), so null it out.
      market_value: isOpened ? null : marketValue,
      ...(isOpened
        ? { market_value_updated_at: null }
        : pickedNow
          ? { market_value_updated_at: new Date().toISOString() }
          : {}),
    };

    if (isEdit) {
      const { error: err } = await supabase
        .from("product_purchases")
        .update(payload)
        .eq("id", initial!.id)
        .eq("user_id", user!.id);
      if (err) { setError(err.message); setLoading(false); return; }
    } else {
      const { error: err } = await supabase
        .from("product_purchases")
        .insert({ ...payload, user_id: user!.id });
      if (err) { setError(err.message); setLoading(false); return; }
    }

    router.push("/inventory/products");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/inventory/products" className="text-foreground-muted hover:text-foreground transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{isEdit ? "Edit Product" : "Add Product Purchase"}</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">
              Track sealed products to calculate pull P/L
            </p>
          </div>
        </div>
        <Link
          href="/inventory"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="14" height="18" rx="2" /><rect x="8" y="1" width="14" height="18" rx="2" />
          </svg>
          Cards
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Product Details</h2>

          <div>
            <label className={labelClass()}>Find Product</label>
            <SealedProductSearch onSelect={handleProductSelect} />
            <p className="mt-1.5 text-xs text-foreground-muted">
              Pick a match to track its live market value — or just type the name below to log it without pricing.
            </p>
          </div>

          {imageUrl && (
            <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-raised p-4">
              <Image
                src={imageUrl} alt={name || "Sealed product"}
                width={48} height={68} sizes="48px"
                className="h-[68px] w-12 rounded object-contain flex-shrink-0"
              />
              <div className="min-w-0">
                {tcgSetName && <p className="text-xs text-foreground-muted truncate">{tcgSetName}</p>}
                {isOpened ? (
                  <p className="text-sm text-foreground-muted">
                    Opened — sealed market value no longer applies. Track worth via the pulled cards.
                  </p>
                ) : (
                  <>
                    {marketValue != null ? (
                      <p className="text-sm text-foreground">
                        Market value: <span className="font-semibold text-gold">${marketValue.toFixed(2)}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-foreground-muted">No market price available yet.</p>
                    )}
                    <p className="text-xs text-foreground-muted mt-0.5">Auto-updates on market refresh.</p>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass()}>Product Name</label>
              <input
                required type="text"
                placeholder="Surging Sparks Elite Trainer Box"
                value={name} onChange={(e) => setName(e.target.value)}
                className={inputClass()}
              />
            </div>
            <div>
              <label className={labelClass()}>Product Type</label>
              <select required value={productType} onChange={(e) => setProductType(e.target.value)} className={selectClass()}>
                <option value="">Select type</option>
                {PRODUCT_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass()}>Cost Paid ($)</label>
              <input
                required type="number" step="0.01" min="0" placeholder="0.00"
                value={cost}
                onChange={(e) => { setCost(e.target.value); setCostIsMsrp(false); }}
                className={`${inputClass()} no-spinner`}
              />
              {costIsMsrp && (
                <p className="mt-1.5 text-xs text-foreground-muted">
                  Pre-filled with MSRP (est.) — edit if you paid a different price.
                </p>
              )}
            </div>
            <div>
              <label className={labelClass()}>Purchase Date</label>
              <input
                required type="date"
                value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)}
                className={inputClass()}
              />
            </div>
          </div>

          {/* Physical status */}
          <div>
            <label className={labelClass()}>Status</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map(({ value, label, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                    status === value
                      ? "border-gold bg-gold/10"
                      : "border-border hover:border-gold/40"
                  }`}
                >
                  <p className={`text-xs font-semibold ${status === value ? "text-gold" : "text-foreground"}`}>{label}</p>
                  <p className="text-xs text-foreground-muted mt-0.5 leading-tight">{description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Listing flags */}
          <div className="flex items-center gap-6">
            <Toggle
              on={forSale}
              onToggle={() => {
                const next = !forSale;
                setForSale(next);
                if (next && !listPrice && marketValue != null && !isOpened) setListPrice(String(marketValue));
              }}
              label="List for Sale"
            />
            <Toggle on={forTrade} onToggle={() => setForTrade((v) => !v)} label="Available to Trade" />
          </div>

          {forSale && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground-muted">List Price ($)</span>
                {marketValue != null && !isOpened && (
                  <button
                    type="button"
                    onClick={() => setListPrice(String(marketValue))}
                    className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs font-medium text-gold hover:bg-gold/15 transition-colors"
                  >
                    mkt · ${marketValue.toFixed(2)}
                  </button>
                )}
              </div>
              <input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={listPrice} onChange={(e) => setListPrice(e.target.value)}
                className={`${inputClass()} no-spinner`}
              />
            </div>
          )}

          <div>
            <label className={labelClass()}>Notes</label>
            <textarea
              rows={2} placeholder="Any notes about this product..."
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className={`${inputClass()} resize-none`}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Product"}
          </button>
          <Link href="/inventory/products"
            className="rounded-full border border-border px-8 py-3 text-sm font-semibold text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
