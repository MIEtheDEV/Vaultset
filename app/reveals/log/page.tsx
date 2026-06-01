"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { PokemonCardSearch } from "@/components/PokemonCardSearch";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

function LogRevealForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const productId    = searchParams.get("product") ?? null;

  const [productName, setProductName] = useState("");
  const [cardName, setCardName]       = useState("");
  const [setName, setSetName]         = useState("");
  const [cardNumber, setCardNumber]   = useState("");
  const [imageUrl, setImageUrl]       = useState("");
  const [rarity, setRarity]           = useState("");
  const [notes, setNotes]             = useState("");
  const [visibility, setVisibility]   = useState<"public" | "private">("public");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  useEffect(() => {
    if (!productId) return;
    const supabase = createClient();
    supabase.from("product_purchases").select("name").eq("id", productId).maybeSingle()
      .then(({ data }) => { if (data) setProductName(data.name); });
  }, [productId]);

  function handleCardSelect(card: {
    id: string; name: string; number: string; rarity?: string;
    set: { id: string; name: string };
    images: { small: string; large: string };
    tcgplayer?: TcgPlayerData | null;
  }) {
    setCardName(card.name);
    setSetName(card.set.name);
    setCardNumber(card.number);
    setImageUrl(card.images.large ?? card.images.small ?? "");
    setRarity(card.rarity ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cardName.trim()) { setError("Search for a card first."); return; }

    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { error: insertError } = await supabase.from("pack_reveals").insert({
      user_id:             user.id,
      product_purchase_id: productId ?? null,
      card_name:           cardName.trim(),
      set_name:            setName   || null,
      card_number:         cardNumber || null,
      image_url:           imageUrl  || null,
      rarity:              rarity    || null,
      notes:               notes.trim() || null,
      visibility,
    });

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
          <label className="block text-sm font-medium text-foreground-muted">Card pulled</label>
          <PokemonCardSearch onSelect={handleCardSelect} />
        </div>

        {cardName && (
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
            {imageUrl ? (
              <div className="relative w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-surface-raised">
                <Image src={imageUrl} alt={cardName} fill sizes="56px" className="object-contain" />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{cardName}</p>
              <p className="text-xs text-foreground-muted mt-0.5">
                {setName}{cardNumber ? ` · #${cardNumber}` : ""}
              </p>
              {rarity && <p className="text-xs text-foreground-muted capitalize">{rarity.replace(/_/g, " ")}</p>}
            </div>
            <button
              type="button"
              onClick={() => { setCardName(""); setSetName(""); setCardNumber(""); setImageUrl(""); setRarity(""); }}
              className="ml-auto text-xs text-foreground-muted hover:text-foreground transition-colors flex-shrink-0"
            >
              Clear
            </button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground-muted mb-1.5">
            Caption <span className="font-normal">(optional)</span>
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
            onClick={() => setVisibility((v) => v === "public" ? "private" : "public")}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
              visibility === "public" ? "bg-gold border-gold" : "bg-surface border-border"
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              visibility === "public" ? "translate-x-6" : "translate-x-1"
            }`} />
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || !cardName}
            className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {loading ? "Saving…" : "Log Pull"}
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
