import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { ListingDetail } from "@/components/ListingDetail";
import { getListingSetSignal } from "@/lib/sets/masterset";
import { FINISH_LABELS } from "@/lib/sets/setCardFinishes";
import { isOnVacation, vacationReturnDate } from "@/lib/vacation";
import { mergeDailySeries, apiDailyChange, dailyChange, type PricePoint, type Change } from "@/lib/priceHistory";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import { extractApiCardHistory } from "@/lib/pricing/cardHistory";

const CONDITION_LABEL: Record<string, string> = {
  mint: "Mint", near_mint: "Near Mint", lightly_played: "Lightly Played",
  moderately_played: "Moderately Played", heavily_played: "Heavily Played", damaged: "Damaged",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("collection_items")
    .select("condition, finish, list_price, grader, grade, cards(name, set_name, card_number, year, image_url)")
    .eq("id", id)
    .or("for_sale.eq.true,for_trade.eq.true")
    .single();

  if (!listing) return { title: "Listing Not Found", robots: { index: false } };
  const card = Array.isArray(listing.cards) ? listing.cards[0] : listing.cards;
  if (!card) return { title: "Listing", robots: { index: false } };

  const gradeStr   = listing.grader && listing.grade != null ? `${listing.grader} ${listing.grade}` : null;
  const condStr    = listing.condition ? (CONDITION_LABEL[listing.condition] ?? listing.condition) : null;
  const qualityStr = gradeStr ?? condStr ?? "";
  const yearStr    = (card as any).year ? ` (${(card as any).year})` : "";
  const numStr     = (card as any).card_number ? ` #${(card as any).card_number}` : "";

  const title       = `${card.name}${numStr} – ${card.set_name}${yearStr}${qualityStr ? ` – ${qualityStr}` : ""}`;
  const priceStr    = listing.list_price != null ? ` Listed at $${listing.list_price}.` : "";
  const description = `${card.name} from ${card.set_name}${numStr}.${priceStr} ${qualityStr} condition. Buy or trade on Vaultset Marketplace.`;

  return {
    title,
    description,
    alternates: { canonical: `/marketplace/${id}` },
    openGraph: {
      title: `${title} — Vaultset`,
      description,
      type: "website",
      images: card.image_url ? [{ url: card.image_url, alt: card.name }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: card.image_url ? [card.image_url] : [],
    },
  };
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Listings are gated — send logged-out visitors to sign in.
  if (!user) redirect("/login");

  const { data: listing } = await supabase
    .from("collection_items")
    .select(`
      id, user_id, condition, finish, for_sale, for_trade,
      list_price, market_price, quantity, grader, grade, cert_number, notes, created_at, on_hold,
      cards (
        id, game, name, set_name, set_code, card_number, year, image_url, game_data
      )
    `)
    .eq("id", id)
    .or("for_sale.eq.true,for_trade.eq.true")
    .single();

  if (!listing) redirect("/marketplace");

  const card = Array.isArray(listing.cards) ? listing.cards[0] : listing.cards;
  if (!card) redirect("/marketplace");

  const { data: seller } = await supabase
    .from("profiles")
    .select("id, username, created_at, followers_only_offers, is_pro, pro_plan, pro_expires_at, vacation_mode, vacation_message, vacation_starts_at, vacation_ends_at")
    .eq("id", listing.user_id)
    .single();

  const { data: otherListings } = await supabase
    .from("collection_items")
    .select(`
      id, for_sale, for_trade, list_price, grader, grade, condition,
      cards ( name, set_name, image_url, game_data )
    `)
    .eq("user_id", listing.user_id)
    .or("for_sale.eq.true,for_trade.eq.true")
    .eq("on_hold", false)
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(6);

  // Pro-only: does this listing advance the viewer's set/master-set completion?
  // (Skip on the viewer's own listings.)
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("is_pro")
    .eq("id", user.id)
    .single();
  const setSignal =
    (viewerProfile as any)?.is_pro && listing.user_id !== user.id
      ? await getListingSetSignal(
          supabase,
          user.id,
          { set_code: (card as any).set_code, set_name: card.set_name, card_number: card.card_number },
          (listing as any).finish ?? null,
        )
      : null;

  // Market-value history for the value-over-time chart. price_history is RLS-restricted
  // to the owner, so read it with the service-role client — read-only, and a listed
  // card's value-over-time is public, non-sensitive data.
  const admin = createAdminClient();
  const apiId = priceApiId((card as any).game_data ?? {}, (card as any).id);
  const [{ data: histRows }, { data: priceRow }] = await Promise.all([
    admin
      .from("price_history")
      .select("market_price, snapshotted_at")
      .eq("collection_item_id", id)
      .order("snapshotted_at", { ascending: true }),
    apiId
      ? admin.from("card_prices").select("raw").eq("card_api_id", apiId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ownPoints: PricePoint[] = (histRows ?? []).map((h) => ({
    date: h.snapshotted_at as string,
    value: Number(h.market_price),
  }));
  const api = extractApiCardHistory((priceRow as any)?.raw, {
    finish: (listing as any).finish ?? null,
    edition: ((card as any).game_data as any)?.edition ?? null,
    condition: listing.condition,
    grader: listing.grader,
  });
  const marketPrice = (listing as any).market_price ?? null;
  const valueHistory: PricePoint[] = mergeDailySeries(api?.points ?? [], ownPoints, marketPrice);
  // Ticker: prefer the provider's real 24h move, else fall back to our snapshot diff.
  const valueChange: Change | null = apiDailyChange(api?.change24hrPct, marketPrice) ?? dailyChange(valueHistory);

  const sellerFollowersOnly = !!(seller as any)?.followers_only_offers;
  const sellerOnVacation    = isOnVacation(seller as any);
  const vacationReturn      = vacationReturnDate(seller as any);

  const [{ data: watchEntry }, { data: followEntry }] = await Promise.all([
    user
      ? supabase.from("watchlist").select("id").eq("user_id", user.id).eq("item_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    sellerFollowersOnly && user && listing.user_id !== user.id
      ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", listing.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // ── Product JSON-LD ──────────────────────────────────────────────────────────
  const condStr   = listing.condition ? (CONDITION_LABEL[listing.condition] ?? listing.condition) : null;
  const gradeStr  = listing.grader && listing.grade != null ? `${listing.grader} ${listing.grade}` : null;
  const qualDesc  = gradeStr ? `Graded ${gradeStr}.` : condStr ? `${condStr} condition.` : "";
  const finishMap: Record<string, string> = {
    holofoil: "Holofoil", reverse_holofoil: "Reverse Holofoil",
    textured_holofoil: "Textured Holofoil", gold_etched: "Gold Etched", non_holo: "Non-Holo",
  };
  const finishDesc = (listing as any).finish ? (finishMap[(listing as any).finish] ?? "") : "";
  const ldDescription = [
    `${card.name} from ${card.set_name}${card.card_number ? ` #${card.card_number}` : ""}.`,
    qualDesc,
    finishDesc,
    listing.notes ?? "",
  ].filter(Boolean).join(" ");

  const sellerUsername = seller?.username ?? "unknown";
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",        item: "https://www.vaultset.app" },
      { "@type": "ListItem", position: 2, name: "Marketplace", item: "https://www.vaultset.app/marketplace" },
      { "@type": "ListItem", position: 3, name: card.name,     item: `https://www.vaultset.app/marketplace/${id}` },
    ],
  };

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: card.name,
    description: ldDescription,
    ...(card.image_url ? { image: card.image_url } : {}),
    brand: { "@type": "Brand", name: card.game === "pokemon" ? "Pokémon" : card.game },
    category: "Trading Card",
    offers: listing.for_sale && listing.list_price != null ? {
      "@type": "Offer",
      url: `https://www.vaultset.app/marketplace/${id}`,
      price: listing.list_price.toFixed(2),
      priceCurrency: "USD",
      availability: (listing as any).on_hold
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      seller: {
        "@type": "Person",
        name: `@${sellerUsername}`,
        url: `https://www.vaultset.app/profile/${sellerUsername}`,
      },
    } : {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      description: "Available for trade",
      seller: {
        "@type": "Person",
        name: `@${sellerUsername}`,
        url: `https://www.vaultset.app/profile/${sellerUsername}`,
      },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />

      {setSignal && (setSignal.needed || setSignal.neededFinish) && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-gold">
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
          </svg>
          <div className="text-sm">
            {setSignal.completesComplete ? (
              <p className="font-semibold text-gold">
                This is the last card you need to complete your {setSignal.setName} set!
              </p>
            ) : setSignal.needed ? (
              <p className="font-semibold text-foreground">Needed for your {setSignal.setName} set</p>
            ) : (
              <p className="font-semibold text-foreground">Fills a Master Set gap in {setSignal.setName}</p>
            )}
            <p className="mt-0.5 text-foreground-muted">
              {setSignal.needed
                ? `You have ${setSignal.complete.owned}/${setSignal.complete.total} cards in this set.`
                : `You own this card but not the ${FINISH_LABELS[setSignal.listingFinish!] ?? setSignal.listingFinish} finish — ${setSignal.master.owned}/${setSignal.master.total} finishes collected.`}{" "}
              <Link href={`/masterset/${encodeURIComponent(setSignal.setCode)}`} className="text-gold hover:underline">
                View master set →
              </Link>
            </p>
          </div>
        </div>
      )}

      <ListingDetail
        listing={{
          id:          listing.id,
          user_id:     listing.user_id,
          condition:   listing.condition,
          finish:      (listing as any).finish,
          for_sale:    listing.for_sale,
          for_trade:   listing.for_trade,
          list_price:  listing.list_price,
          quantity:    listing.quantity,
          grader:      listing.grader,
          grade:       listing.grade,
          cert_number: (listing as any).cert_number,
          notes:       listing.notes,
          created_at:  listing.created_at,
          on_hold:     (listing as any).on_hold ?? false,
        }}
        card={{
          id:          card.id,
          game:        card.game,
          name:        card.name,
          set_name:    card.set_name,
          card_number: card.card_number,
          year:        card.year,
          image_url:   card.image_url,
          game_data:   card.game_data as Record<string, unknown> | null,
        }}
        seller={seller ?? { id: listing.user_id, username: "Unknown", created_at: listing.created_at }}
        otherListings={(otherListings ?? []).map((l) => ({
          id:         l.id,
          for_sale:   l.for_sale,
          for_trade:  l.for_trade,
          list_price: l.list_price,
          grader:     l.grader,
          grade:      l.grade,
          condition:  l.condition,
          card:       Array.isArray(l.cards) ? l.cards[0] : l.cards,
        }))}
        valueHistory={valueHistory}
        valueChange={valueChange}
        currentUserId={user?.id ?? ""}
        initialWatched={!!watchEntry}
        sellerFollowersOnly={sellerFollowersOnly}
        currentUserFollowsSeller={!!followEntry}
        sellerOnVacation={sellerOnVacation}
        vacationMessage={(seller as any)?.vacation_message ?? null}
        vacationReturnAt={vacationReturn ? vacationReturn.toISOString() : null}
      />
    </>
  );
}
