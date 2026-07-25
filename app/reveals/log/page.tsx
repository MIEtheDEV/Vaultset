"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { PokemonCardSearch } from "@/components/PokemonCardSearch";
import { RevealInventoryPicker, type RevealInventoryCard } from "@/components/RevealInventoryPicker";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

interface SelectedCard {
  key: string;                     // dedupe key: `ci:<id>` (inventory) or `search:<id>` (catalog)
  cardName: string;
  setName: string;
  cardNumber: string;
  imageUrl: string;
  rarity: string;
  cardId: string | null;
  collectionItemId: string | null;
}

function LogRevealForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const productId    = searchParams.get("product") ?? null;

  const [productName, setProductName] = useState("");
  const [selected, setSelected]       = useState<SelectedCard[]>([]);
  const [notes, setNotes]             = useState("");
  const [visibility, setVisibility]   = useState<"public" | "private">("public");
  const [source, setSource]           = useState<"inventory" | "search">("inventory");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  const selectedItemIds = useMemo(
    () => new Set(selected.map((c) => c.collectionItemId).filter((id): id is string => id !== null)),
    [selected],
  );

  useEffect(() => {
    if (!productId) return;
    const supabase = createClient();
    supabase.from("product_purchases").select("name").eq("id", productId).maybeSingle()
      .then(({ data }) => { if (data) setProductName(data.name); });
  }, [productId]);

  function addCard(card: SelectedCard) {
    setSelected((prev) => prev.some((c) => c.key === card.key) ? prev : [...prev, card]);
  }

  function removeCard(key: string) {
    setSelected((prev) => prev.filter((c) => c.key !== key));
  }

  function handleCardSelect(card: {
    id: string; name: string; number: string; rarity?: string;
    set: { id: string; name: string };
    images: { small: string; large: string };
    tcgplayer?: TcgPlayerData | null;
  }) {
    addCard({
      key:              `search:${card.id}`,
      cardName:         card.name,
      setName:          card.set.name,
      cardNumber:       card.number,
      imageUrl:         card.images.large ?? card.images.small ?? "",
      rarity:           card.rarity ?? "",
      cardId:           null,
      collectionItemId: null,
    });
  }

  function handleInventoryToggle(card: RevealInventoryCard) {
    const key = `ci:${card.collectionItemId}`;
    setSelected((prev) =>
      prev.some((c) => c.key === key)
        ? prev.filter((c) => c.key !== key)
        : [...prev, {
            key,
            cardName:         card.name,
            setName:          card.setName,
            cardNumber:       card.cardNumber,
            imageUrl:         card.imageUrl,
            rarity:           card.rarity,
            cardId:           card.cardId,
            collectionItemId: card.collectionItemId,
          }],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) { setError("Pick at least one card first."); return; }

    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // One group id ties this batch together so the feed renders it as a single reveal.
    const groupId = crypto.randomUUID();

    const rows = selected.map((c) => ({
      user_id:             user.id,
      product_purchase_id: productId ?? null,
      reveal_group_id:     groupId,
      card_name:           c.cardName.trim(),
      set_name:            c.setName   || null,
      card_number:         c.cardNumber || null,
      image_url:           c.imageUrl  || null,
      rarity:              c.rarity    || null,
      card_id:             c.cardId,
      collection_item_id:  c.collectionItemId,
      notes:               notes.trim() || null,
      visibility,
    }));

    const { error: insertError } = await supabase.from("pack_reveals").insert(rows);

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push("/reveals");
    router.refresh();
  }

  return (
    <div className="space-y-8 max-w-lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Log a Pull</h1>
          {productName && (
            <p className="mt-1 text-sm text-foreground-muted">
              From <span className="text-foreground">{productName}</span>
            </p>
          )}
        </div>
        <Link href="/reveals" className="text-sm text-foreground-muted hover:text-foreground transition-colors">
          ← Reveals
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground-muted">
            Cards pulled{selected.length > 0 ? ` (${selected.length})` : ""}
          </label>

          <div className="inline-flex rounded-full border border-border bg-surface-raised p-0.5">
            {(["inventory", "search"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  source === s ? "bg-gold text-background" : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {s === "inventory" ? "From my inventory" : "Search catalog"}
              </button>
            ))}
          </div>

          {source === "inventory"
            ? <RevealInventoryPicker productId={productId} selectedIds={selectedItemIds} onToggle={handleInventoryToggle} />
            : <PokemonCardSearch onSelect={handleCardSelect} />
          }
          {source === "search" && (
            <p className="text-xs text-foreground-muted">Pick a card to add it — search again to add more.</p>
          )}
        </div>

        {selected.length > 0 && (
          <ul className="space-y-2">
            {selected.map((card) => (
              <li key={card.key} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                {card.imageUrl ? (
                  <div className="relative w-10 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-surface-raised">
                    <Image src={card.imageUrl} alt={card.cardName} fill sizes="40px" className="object-contain" />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground text-sm">{card.cardName}</p>
                  <p className="truncate text-xs text-foreground-muted mt-0.5">
                    {card.setName}{card.cardNumber ? ` · #${card.cardNumber}` : ""}
                  </p>
                  {card.rarity && <p className="text-xs text-foreground-muted capitalize">{card.rarity.replace(/_/g, " ")}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => removeCard(card.key)}
                  aria-label={`Remove ${card.cardName}`}
                  className="ml-auto text-xs text-foreground-muted hover:text-foreground transition-colors flex-shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground-muted mb-1.5">
            Caption <span className="font-normal">(optional{selected.length > 1 ? ", applies to all" : ""})</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Pulled this from a vintage booster…"
            className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none resize-none"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-raised px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Visibility</p>
            <p className="text-xs text-foreground-muted mt-0.5">
              {visibility === "public" ? "Visible on the community reveal feed" : "Only visible to you"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={visibility === "public"}
            onClick={() => setVisibility((v) => v === "public" ? "private" : "public")}
            className={`relative flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors ${
              visibility === "public" ? "border-gold bg-gold" : "border-border bg-surface-raised"
            }`}
          >
            <span className={`h-4 w-4 rounded-full bg-background shadow transition-transform ${
              visibility === "public" ? "translate-x-5" : "translate-x-0.5"
            }`} />
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || selected.length === 0}
            className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {loading ? "Saving…" : selected.length > 1 ? `Log ${selected.length} Pulls` : "Log Pull"}
          </button>
          <Link
            href="/reveals"
            className="rounded-full border border-border px-8 py-3 text-sm font-semibold text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function LogRevealPage() {
  return (
    <Suspense>
      <LogRevealForm />
    </Suspense>
  );
}
