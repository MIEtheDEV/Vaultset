"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

interface Props {
  itemId: string;
  marketPrice: number;
  listPrice: number | null;
  forSale: boolean;
}

export function ListAtMarketButton({ itemId, marketPrice, listPrice, forSale }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isListedAtMarket =
    forSale && listPrice != null && Math.abs(listPrice - marketPrice) < 0.001;

  if (isListedAtMarket) {
    return (
      <span className="inline-flex items-center rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
        Listed at market
      </span>
    );
  }

  const label = forSale
    ? `Update to Mkt · $${marketPrice.toFixed(2)}`
    : `List at Mkt · $${marketPrice.toFixed(2)}`;

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("collection_items")
      .update({ for_sale: true, list_price: marketPrice })
      .eq("id", itemId);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold hover:bg-gold/20 transition-colors disabled:opacity-50"
    >
      {loading ? "Listing…" : label}
    </button>
  );
}
