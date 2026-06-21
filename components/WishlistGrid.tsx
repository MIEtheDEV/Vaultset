"use client";

import { useState } from "react";
import Image from "next/image";
import { RemoveWishlistButton } from "@/components/RemoveWishlistButton";
import { WishlistCardDrawer, type WishlistDrawerCard } from "@/components/WishlistCardDrawer";

export interface WishlistGridItem {
  id: string;
  pokemon_api_id: string | null;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  notes: string | null;
  target_price: number | null;
}

export function WishlistGrid({ items }: { items: WishlistGridItem[] }) {
  const [active, setActive] = useState<WishlistDrawerCard | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-border bg-surface overflow-hidden flex flex-col hover:border-gold/30 transition-colors"
          >
            <button
              type="button"
              onClick={() => setActive(item)}
              className="group text-left"
              aria-label={`See who has ${item.card_name} listed`}
            >
              <div className="relative aspect-[2/3] w-full bg-surface-raised overflow-hidden">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.card_name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    className="object-contain transition-transform group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                    </svg>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent py-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  See listings
                </div>
              </div>
            </button>

            <div className="p-3 flex flex-col gap-2 flex-1">
              <button type="button" onClick={() => setActive(item)} className="flex-1 space-y-0.5 text-left">
                <p className="text-xs font-semibold text-foreground leading-tight">{item.card_name}</p>
                <p className="text-xs text-foreground-muted truncate">{item.set_name}</p>
                {item.card_number && (
                  <p className="text-xs text-foreground-muted">#{item.card_number}</p>
                )}
                {item.notes && (
                  <p className="text-xs text-foreground-muted italic leading-tight pt-1 border-t border-border mt-1">
                    {item.notes}
                  </p>
                )}
                {item.target_price != null && (
                  <p className="text-xs text-gold font-medium pt-1">
                    Alert: ≤${Number(item.target_price).toFixed(2)}
                  </p>
                )}
              </button>
              <RemoveWishlistButton id={item.id} />
            </div>
          </div>
        ))}
      </div>

      <WishlistCardDrawer card={active} onClose={() => setActive(null)} />
    </>
  );
}
