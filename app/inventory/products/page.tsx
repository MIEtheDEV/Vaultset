import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { RemoveProductButton } from "@/components/RemoveProductButton";
import { PRODUCT_TYPE_LABEL as productTypeLabel } from "@/lib/products";

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: products } = await supabase
    .from("product_purchases")
    .select(`
      id, name, product_type, cost, list_price, status, for_sale, for_trade, purchased_at, notes, created_at,
      collection_items ( id, quantity, list_price )
    `)
    .eq("user_id", user.id)
    .order("purchased_at", { ascending: false });

  const totalInvested = products?.reduce((sum, p) => sum + Number(p.cost), 0) ?? 0;

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Purchases</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Track sealed products and calculate pull returns.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="14" height="18" rx="2" /><rect x="8" y="1" width="14" height="18" rx="2" />
            </svg>
            Cards
          </Link>
          <Link
            href="/inventory/products/add"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Product
          </Link>
        </div>
      </div>

      {/* Summary */}
      {products && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: "Products Tracked", value: String(products.length) },
            { label: "Total Invested",   value: `$${totalInvested.toFixed(2)}` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">{label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {(!products || products.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface py-24 text-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised text-foreground-muted">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-foreground">No products tracked yet</p>
            <p className="mt-1 text-sm text-foreground-muted">Add an ETB, booster box, or bundle to start tracking pull returns.</p>
          </div>
          <Link href="/inventory/products/add"
            className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
          >
            Add your first product
          </Link>
        </div>
      )}

      {/* Product list */}
      {products && products.length > 0 && (
        <div className="space-y-4">
          {products.map((product) => {
            const cards       = product.collection_items ?? [];
            const pullCount   = cards.reduce((sum, c) => sum + ((c as any).quantity ?? 1), 0);
            const pullValue   = cards.reduce((sum, c) => sum + ((c as any).list_price != null ? Number((c as any).list_price) * ((c as any).quantity ?? 1) : 0), 0);
            const net         = pullValue - Number(product.cost);
            const hasValue    = pullValue > 0;

            return (
              <div key={product.id} className="rounded-2xl border border-border bg-surface overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 px-6 py-4 border-b border-border bg-surface-raised">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{product.name}</p>
                      {(product as any).status === "opened"
                        ? <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground-muted">Opened</span>
                        : <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">Sealed</span>
                      }
                      {(product as any).for_sale  && <span className="rounded-full bg-gold/90 px-2 py-0.5 text-xs font-semibold text-background">For Sale</span>}
                      {(product as any).for_trade && <span className="rounded-full bg-blue-400/90 px-2 py-0.5 text-xs font-semibold text-background">Trade</span>}
                    </div>
                    <p className="text-xs text-foreground-muted mt-0.5">
                      {productTypeLabel[product.product_type] ?? product.product_type}
                      {" · "}
                      {new Date(product.purchased_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/inventory/products/${product.id}/link`}
                      className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-xs font-medium text-gold hover:bg-gold/10 transition-colors"
                    >
                      + Add Pulled Card
                    </Link>
                    <Link
                      href={`/reveals/log?product=${product.id}`}
                      className="rounded-full border border-violet-500/30 bg-violet-500/5 px-3 py-1 text-xs font-medium text-violet-400 hover:bg-violet-500/10 transition-colors"
                    >
                      Log Reveal
                    </Link>
                    <Link
                      href={`/inventory/products/${product.id}/edit`}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
                    >
                      Edit
                    </Link>
                    <RemoveProductButton productId={product.id} />
                  </div>
                </div>

                <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-foreground-muted">Cost Paid</p>
                    <p className="mt-0.5 font-semibold text-foreground">${Number(product.cost).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted">Cards Pulled</p>
                    <p className="mt-0.5 font-semibold text-foreground">{pullCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted">Pull Value</p>
                    <p className="mt-0.5 font-semibold text-foreground">
                      {hasValue ? `$${pullValue.toFixed(2)}` : <span className="text-foreground-muted text-xs">No list prices set</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted">Net P/L</p>
                    <p className={`mt-0.5 font-semibold ${!hasValue ? "text-foreground-muted" : net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {!hasValue ? "—" : `${net >= 0 ? "+" : ""}$${net.toFixed(2)}`}
                    </p>
                  </div>
                </div>

                {product.notes && (
                  <div className="px-6 pb-4">
                    <p className="text-xs text-foreground-muted">{product.notes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
