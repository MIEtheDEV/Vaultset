import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { RemoveWishlistButton } from "@/components/RemoveWishlistButton";
import { dedupeMatches, type WishlistMatch } from "@/lib/wishlistMatches";

export const metadata: Metadata = {
  title: "My Wishlist",
  robots: { index: false },
};

export default async function WishlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: items },
    { data: matchData },
  ] = await Promise.all([
    supabase
      .from("wishlist_items")
      .select("id, pokemon_api_id, card_name, set_name, card_number, image_url, notes, target_price")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_wishlist_matches", { p_user_id: user.id }),
  ]);

  const matches = dedupeMatches((matchData as WishlistMatch[] | null) ?? []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Wishlist</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Cards you&apos;re looking for — visible on your public profile so sellers can find you.
          </p>
        </div>
        <Link
          href="/wishlist/add"
          className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Card
        </Link>
      </div>

      {matches.length > 0 && (
        <div className="rounded-2xl border border-gold/20 bg-gold/5">
          <div className="flex items-center justify-between border-b border-gold/20 px-6 py-4">
            <div>
              <h2 className="font-semibold text-foreground">Available Now</h2>
              <p className="text-xs text-foreground-muted mt-0.5">
                {matches.length} {matches.length === 1 ? "card" : "cards"} on your wishlist {matches.length === 1 ? "is" : "are"} listed for sale or trade
              </p>
            </div>
            <Link href="/marketplace?filter=wanted" className="text-xs text-gold hover:text-gold-light transition-colors">
              Browse marketplace →
            </Link>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {matches.map((match) => (
              <Link
                key={match.listing_id}
                href={`/marketplace/${match.listing_id}`}
                className="rounded-xl border border-gold/20 bg-surface overflow-hidden flex flex-col hover:border-gold/50 hover:bg-surface-raised transition-colors"
              >
                <div className="relative aspect-[2/3] w-full bg-surface-raised overflow-hidden">
                  {match.image_url ? (
                    <Image
                      src={match.image_url}
                      alt={match.card_name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-2.5 space-y-1">
                  <p className="text-xs font-semibold text-foreground leading-tight truncate">{match.card_name}</p>
                  <p className="text-xs text-foreground-muted truncate">{match.set_name}</p>
                  <div className="flex items-center justify-between pt-1">
                    {match.for_sale && match.list_price != null ? (
                      <span className="text-xs font-bold text-gold">${Number(match.list_price).toFixed(2)}</span>
                    ) : (
                      <span className="text-xs text-blue-400">For Trade</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted truncate">@{match.seller_username}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!items || items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">Your wishlist is empty</p>
          <p className="text-xs text-foreground-muted max-w-sm mx-auto">
            Add cards you&apos;re hunting for so other collectors know what you need.
          </p>
          <Link
            href="/wishlist/add"
            className="mt-2 inline-block rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
          >
            Add your first card
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-border bg-surface overflow-hidden flex flex-col hover:border-gold/30 transition-colors"
            >
              <div className="relative aspect-[2/3] w-full bg-surface-raised overflow-hidden">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.card_name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    className="object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="flex-1 space-y-0.5">
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
                  {(item as any).target_price != null && (
                    <p className="text-xs text-gold font-medium pt-1">
                      Alert: ≤${Number((item as any).target_price).toFixed(2)}
                    </p>
                  )}
                </div>
                <RemoveWishlistButton id={item.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
