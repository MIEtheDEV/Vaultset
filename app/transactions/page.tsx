/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const metadata: Metadata = {
  title: "Transaction History",
  robots: { index: false },
};

const OFFER_TYPE_LABEL: Record<string, string> = {
  cash:   "Cash",
  trade:  "Trade",
  bundle: "Bundle",
};

const TYPE_CLASSES: Record<string, string> = {
  cash:   "text-gold bg-gold/10 border-gold/30",
  trade:  "text-blue-400 bg-blue-400/10 border-blue-400/30",
  bundle: "text-purple-400 bg-purple-400/10 border-purple-400/30",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatUSD(amount: number | null) {
  if (amount == null) return "—";
  return `$${Number(amount).toFixed(2)}`;
}

export default async function TransactionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const COMPLETED_SELECT = `
    id, offer_type, offer_amount, created_at, sender_id, recipient_id,
    listing:collection_items!listing_id(
      id,
      cards(name, set_name, image_url)
    )
  ` as const;

  const [soldRes, boughtRes] = await Promise.all([
    admin
      .from("offers")
      .select(COMPLETED_SELECT)
      .eq("status", "completed")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("offers")
      .select(COMPLETED_SELECT)
      .eq("status", "completed")
      .eq("sender_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const sold   = soldRes.data   ?? [];
  const bought = boughtRes.data ?? [];

  const allIds = [...new Set([
    ...sold.map((o) => o.sender_id as string),
    ...bought.map((o) => o.recipient_id as string),
  ])];

  const { data: profiles } = allIds.length
    ? await admin.from("profiles").select("id, username").in("id", allIds)
    : { data: [] as { id: string; username: string }[] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const totalSoldCash   = sold.filter((o) => o.offer_type === "cash").reduce((s, o) => s + Number(o.offer_amount ?? 0), 0);
  const totalBoughtCash = bought.filter((o) => o.offer_type === "cash").reduce((s, o) => s + Number(o.offer_amount ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transaction History</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Completed deals — both as seller and buyer.
          </p>
        </div>
        <Link
          href="/offers"
          className="text-sm text-foreground-muted hover:text-foreground transition-colors"
        >
          ← Active offers
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Transactions sold" value={sold.length.toString()} />
        <StatCard label="Transactions bought" value={bought.length.toString()} />
        <StatCard label="Total sold (cash)" value={`$${totalSoldCash.toFixed(2)}`} />
        <StatCard label="Total spent (cash)" value={`$${totalBoughtCash.toFixed(2)}`} />
      </div>

      {/* Sold */}
      <section className="space-y-4">
        <h2 className="font-semibold text-foreground">Sold ({sold.length})</h2>
        {sold.length === 0 ? (
          <EmptyState message="No completed sales yet." />
        ) : (
          <TransactionTable transactions={sold} counterpartyKey="sender_id" profileMap={profileMap} role="sold" />
        )}
      </section>

      {/* Bought */}
      <section className="space-y-4">
        <h2 className="font-semibold text-foreground">Bought ({bought.length})</h2>
        {bought.length === 0 ? (
          <EmptyState message="No completed purchases yet." />
        ) : (
          <TransactionTable transactions={bought} counterpartyKey="recipient_id" profileMap={profileMap} role="bought" />
        )}
      </section>
    </div>
  );
}

function TransactionTable({
  transactions,
  counterpartyKey,
  profileMap,
  role,
}: {
  transactions: any[];
  counterpartyKey: "sender_id" | "recipient_id";
  profileMap: Map<string, string>;
  role: "sold" | "bought";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-border bg-surface-raised text-xs font-medium text-foreground-muted uppercase tracking-wide">
        <span className="w-10" />
        <span>Card</span>
        <span className="w-24 text-right">{role === "sold" ? "Buyer" : "Seller"}</span>
        <span className="w-20 text-right">Amount</span>
        <span className="w-24 text-right">Date</span>
      </div>
      <div className="divide-y divide-border">
        {transactions.map((tx) => {
          const listing  = tx.listing as any;
          const cards    = listing?.cards;
          const card     = Array.isArray(cards) ? cards[0] : cards;
          const username = profileMap.get(tx[counterpartyKey] as string) ?? "unknown";
          const typeLabel = OFFER_TYPE_LABEL[tx.offer_type as string] ?? tx.offer_type;

          return (
            <Link
              key={tx.id}
              href={`/offers/${tx.id}`}
              className="flex sm:grid sm:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 hover:bg-surface-raised transition-colors"
            >
              {/* Card image */}
              <div className="relative w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-surface-raised">
                {card?.image_url ? (
                  <Image src={card.image_url} alt={card.name ?? ""} fill sizes="40px" className="object-contain" />
                ) : (
                  <div className="w-full h-full bg-surface-raised" />
                )}
              </div>

              {/* Card info */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{card?.name ?? "Unknown card"}</p>
                <p className="text-xs text-foreground-muted truncate">
                  {card?.set_name ?? ""}
                </p>
                <span className={`mt-1 inline-flex rounded-full border px-1.5 py-0 text-xs font-medium sm:hidden ${TYPE_CLASSES[tx.offer_type as string] ?? ""}`}>
                  {typeLabel}
                </span>
              </div>

              {/* Counterparty */}
              <div className="hidden sm:block text-right">
                <p className="text-xs text-foreground-muted">{role === "sold" ? "Buyer" : "Seller"}</p>
                <p className="text-sm text-gold">@{username}</p>
              </div>

              {/* Amount */}
              <div className="hidden sm:block text-right">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_CLASSES[tx.offer_type as string] ?? ""}`}>
                  {typeLabel}
                </span>
                {tx.offer_amount != null && (
                  <p className="text-sm font-medium text-foreground mt-0.5">{formatUSD(tx.offer_amount)}</p>
                )}
              </div>

              {/* Date */}
              <div className="hidden sm:block text-right shrink-0">
                <p className="text-xs text-foreground-muted">{formatDate(tx.created_at as string)}</p>
              </div>

              {/* Mobile: amount + date */}
              <div className="sm:hidden text-right shrink-0">
                {tx.offer_amount != null && (
                  <p className="text-sm font-medium text-foreground">{formatUSD(tx.offer_amount)}</p>
                )}
                <p className="text-xs text-foreground-muted">{formatDate(tx.created_at as string)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface py-12 text-center">
      <p className="text-sm text-foreground-muted">{message}</p>
    </div>
  );
}
