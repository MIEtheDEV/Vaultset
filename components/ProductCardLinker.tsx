"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const conditionLabel: Record<string, string> = {
  mint: "Mint", near_mint: "NM", lightly_played: "LP",
  moderately_played: "MP", heavily_played: "HP", damaged: "DMG",
};

interface CardItem {
  id:          string;
  linked:      boolean;
  condition:   string | null;
  grader:      string | null;
  grade:       number | null;
  quantity:    number;
  name:        string;
  set_name:    string;
  card_number: string | null;
  image_url:   string | null;
  is_promo:    boolean;
}

export function ProductCardLinker({
  product,
  items,
}: {
  product: { id: string; name: string };
  items:   CardItem[];
}) {
  const router  = useRouter();
  const [search,  setSearch]  = useState("");
  const [linked,  setLinked]  = useState<Set<string>>(() => new Set(items.filter((i) => i.linked).map((i) => i.id)));
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const visible = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  function toggle(id: string) {
    setLinked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    const supabase = createClient();

    const toLink   = items.filter((i) => linked.has(i.id)  && !i.linked).map((i) => i.id);
    const toUnlink = items.filter((i) => !linked.has(i.id) && i.linked).map((i) => i.id);

    const ops: Promise<unknown>[] = [];

    if (toLink.length) {
      ops.push(
        Promise.resolve(
          supabase.from("collection_items")
            .update({ product_purchase_id: product.id })
            .in("id", toLink)
        )
      );
    }
    if (toUnlink.length) {
      ops.push(
        Promise.resolve(
          supabase.from("collection_items")
            .update({ product_purchase_id: null })
            .in("id", toUnlink)
        )
      );
    }

    const results = await Promise.all(ops);
    const failed  = results.find((r: any) => r.error);
    if (failed) {
      setError((failed as any).error.message);
      setSaving(false);
      return;
    }

    router.push("/inventory/products");
    router.refresh();
  }

  const linkedCount = linked.size;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/inventory/products" className="text-foreground-muted hover:text-foreground transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Link Cards to Product</h1>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {product.name} · {linkedCount} card{linkedCount !== 1 ? "s" : ""} linked
          </p>
        </div>
      </div>

      {/* Search + actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted pointer-events-none">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search by card name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface-raised pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link
            href={`/inventory/add?product=${product.id}`}
            className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
          >
            + Add New Card
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
      )}

      {/* Hint */}
      <p className="text-xs text-foreground-muted">
        Click a card to link or unlink it. <span className="text-gold">Highlighted</span> cards are currently linked to this product.
      </p>

      {/* Card grid */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center">
          <p className="text-sm text-foreground-muted">No cards match your search.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map((item) => {
            const isLinked = linked.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                className={`group rounded-2xl border text-left transition-all duration-200 overflow-hidden ${
                  isLinked
                    ? "border-gold bg-gold/5 shadow-[0_0_12px_rgba(232,184,75,0.15)]"
                    : "border-border bg-surface hover:border-gold/30 hover:bg-surface-raised"
                }`}
              >
                {/* Image */}
                <div className="relative aspect-[2.5/3.5] w-full overflow-hidden bg-surface-raised">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                  ) : item.is_promo ? (
                    <div className="absolute inset-0 overflow-hidden">
                      <Image src="/img/promo.png" alt="Promo" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-contain" style={{ padding: "3rem 2rem" }} />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                    </div>
                  )}
                  {isLinked && (
                    <div className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gold shadow-md">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 space-y-1">
                  <p className="text-sm font-semibold text-foreground leading-tight">{item.name}</p>
                  <p className="text-xs text-foreground-muted">
                    {item.set_name}{item.card_number ? ` · ${item.card_number}` : ""}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {item.grader
                      ? `${item.grader} ${item.grade}`
                      : conditionLabel[item.condition ?? ""] ?? "—"}
                    {item.quantity > 1 ? ` · ×${item.quantity}` : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
