"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

const CONDITIONS = [
  { value: "mint",              label: "Mint" },
  { value: "near_mint",         label: "Near Mint" },
  { value: "lightly_played",    label: "Lightly Played" },
  { value: "moderately_played", label: "Moderately Played" },
  { value: "heavily_played",    label: "Heavily Played" },
  { value: "damaged",           label: "Damaged" },
];

const GRADERS = ["PSA", "BGS", "CGC", "SGC"];

const POKEMON_FINISHES = [
  { value: "non_holo",          label: "Non-Holo" },
  { value: "holofoil",          label: "Holofoil" },
  { value: "reverse_holofoil",  label: "Reverse Holofoil" },
  { value: "textured_holofoil", label: "Textured Holofoil" },
  { value: "gold_etched",       label: "Gold Etched" },
];

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

interface Props {
  item: {
    id: string;
    condition: string;
    finish: string;
    quantity: number;
    paid_price: number | null;
    list_price: number | null;
    for_sale: boolean;
    for_trade: boolean;
    grader: string;
    grade: number | null;
    cert_number:         string;
    notes:               string;
    product_purchase_id: string | null;
  };
  card: {
    name: string;
    set_name: string;
    card_number: string;
    game: string;
    image_url: string;
  };
}

export function EditCardForm({ item, card }: Props) {
  const router = useRouter();

  const [products,      setProducts]      = useState<{ id: string; name: string }[]>([]);
  const [linkedProduct, setLinkedProduct] = useState(item.product_purchase_id ?? "");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("product_purchases").select("id, name")
        .eq("user_id", user.id).order("purchased_at", { ascending: false })
        .then(({ data }) => setProducts(data ?? []));
    });
  }, []);

  const [condition, setCondition]   = useState(item.condition);
  const [finish, setFinish]         = useState(item.finish);
  const [quantity, setQuantity]     = useState(String(item.quantity));
  const [paidPrice, setPaidPrice]   = useState(item.paid_price != null ? String(item.paid_price) : "");
  const [listPrice, setListPrice]   = useState(item.list_price != null ? String(item.list_price) : "");
  const [forSale, setForSale]       = useState(item.for_sale);
  const [forTrade, setForTrade]     = useState(item.for_trade);
  const [graded, setGraded]         = useState(!!item.grader || item.grade != null);
  const [grader, setGrader]         = useState(item.grader);
  const [grade, setGrade]           = useState(item.grade != null ? String(item.grade) : "");
  const [certNumber, setCertNumber] = useState(item.cert_number);
  const [notes, setNotes]           = useState(item.notes);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("collection_items")
      .update({
        condition: graded ? null : condition || null,
        finish: finish || null,
        quantity:  Number(quantity),
        paid_price: paidPrice ? Number(paidPrice) : null,
        list_price: listPrice ? Number(listPrice) : null,
        for_sale:  forSale,
        for_trade: forTrade,
        grader:      graded ? grader || null : null,
        grade:       graded && grade ? Number(grade) : null,
        cert_number:         graded ? certNumber || null : null,
        product_purchase_id: linkedProduct || null,
        notes:       notes || null,
      })
      .eq("id", item.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push("/inventory");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/inventory" className="text-foreground-muted hover:text-foreground transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Card</h1>
          <p className="mt-0.5 text-sm text-foreground-muted">Update ownership details for this card</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">

        {/* Card identity — read only */}
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Card</h2>
          <div className="flex gap-4 items-start">
            {card.image_url && (
              <Image src={card.image_url} alt={card.name} width={80} height={112} className="rounded-xl object-contain shadow-md flex-shrink-0" />
            )}
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{card.name}</p>
              <p className="text-sm text-foreground-muted">{card.set_name}{card.card_number ? ` · ${card.card_number}` : ""}</p>
              <span className="inline-block rounded-full bg-surface-raised border border-border px-2 py-0.5 text-xs text-foreground-muted capitalize">{card.game}</span>
            </div>
          </div>
          <p className="text-xs text-foreground-muted">Card identity is managed by the catalog and cannot be edited here.</p>
        </div>

        {/* Ownership */}
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Ownership</h2>

          {products.length > 0 && (
            <div>
              <label className={labelClass()}>Pulled From Product <span className="text-foreground-muted font-normal">(optional)</span></label>
              <select value={linkedProduct} onChange={(e) => setLinkedProduct(e.target.value)} className={selectClass()}>
                <option value="">Not linked to a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {linkedProduct && (
                <p className="mt-1.5 text-xs text-foreground-muted">
                  Purchase price is optional — product cost covers this pull's investment.
                </p>
              )}
            </div>
          )}

          <Toggle on={graded} onToggle={() => setGraded((v) => !v)} label="This card is graded" />

          {graded ? (
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass()}>Grader</label>
                <select value={grader} onChange={(e) => setGrader(e.target.value)} className={selectClass()}>
                  <option value="">Select</option>
                  {GRADERS.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass()}>Grade</label>
                <input type="number" placeholder="9.5" step="0.5" min="1" max="10" value={grade} onChange={(e) => setGrade(e.target.value)} className={inputClass()} />
              </div>
              <div>
                <label className={labelClass()}>Cert Number</label>
                <input type="text" placeholder="12345678" value={certNumber} onChange={(e) => setCertNumber(e.target.value)} className={inputClass()} />
              </div>
            </div>
          ) : (
            <div>
              <label className={labelClass()}>Condition</label>
              <div className="grid grid-cols-3 gap-2">
                {CONDITIONS.map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => setCondition(value)}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                      condition === value
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-border text-foreground-muted hover:border-gold/40 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={labelClass()}>Finish</label>
            <select value={finish} onChange={(e) => setFinish(e.target.value)} className={selectClass()}>
              <option value="">Select finish</option>
              {POKEMON_FINISHES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass()}>Quantity</label>
              <div className="flex items-center rounded-xl border border-border bg-surface-raised overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity(String(Math.max(1, Number(quantity) - 1)))}
                  disabled={Number(quantity) <= 1}
                  className="flex items-center justify-center w-12 py-3 border-r border-border text-foreground-muted hover:text-gold hover:bg-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <span className="flex-1 text-center text-sm font-semibold text-foreground py-3 select-none">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(String(Number(quantity) + 1))}
                  className="flex items-center justify-center w-12 py-3 border-l border-border text-foreground-muted hover:text-gold hover:bg-surface transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass()}>Purchase Price ($)</label>
              <input type="number" step="0.01" placeholder="0.00" value={paidPrice} onChange={(e) => setPaidPrice(e.target.value)} className={`${inputClass()} no-spinner`} />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <Toggle on={forSale}  onToggle={() => setForSale((v) => !v)}  label="List for Sale" />
            <Toggle on={forTrade} onToggle={() => setForTrade((v) => !v)} label="Available to Trade" />
          </div>

          {forSale && (
            <div>
              <label className={labelClass()}>List Price ($)</label>
              <input type="number" step="0.01" placeholder="0.00" value={listPrice} onChange={(e) => setListPrice(e.target.value)} className={`${inputClass()} no-spinner`} />
            </div>
          )}

          <div>
            <label className={labelClass()}>Notes</label>
            <textarea rows={2} placeholder="Any personal notes about this card..." value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass()} resize-none`} />
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {loading ? "Saving…" : "Save Changes"}
          </button>
          <Link href="/inventory"
            className="rounded-full border border-border px-8 py-3 text-sm font-semibold text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
