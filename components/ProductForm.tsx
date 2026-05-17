"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

import { PRODUCT_TYPES } from "@/lib/products";

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
    <button type="button" onClick={onToggle} className="flex items-center gap-3">
      <span className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${on ? "bg-gold border-gold" : "bg-surface-raised border-border"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
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
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

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

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Product Details</h2>

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
                value={cost} onChange={(e) => setCost(e.target.value)}
                className={`${inputClass()} no-spinner`}
              />
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
            <Toggle on={forSale}  onToggle={() => setForSale((v) => !v)}  label="List for Sale" />
            <Toggle on={forTrade} onToggle={() => setForTrade((v) => !v)} label="Available to Trade" />
          </div>

          {forSale && (
            <div>
              <label className={labelClass()}>List Price ($)</label>
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
