import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { EditCardForm } from "@/components/EditCardForm";
import { CardValueChart } from "@/components/CardValueChart";
import { mergeDailySeries, type PricePoint } from "@/lib/priceHistory";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import { extractApiCardHistory } from "@/lib/pricing/cardHistory";

export default async function EditCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: item } = await supabase
    .from("collection_items")
    .select(`
      id,
      condition,
      finish,
      quantity,
      paid_price,
      list_price,
      market_price,
      for_sale,
      product_purchase_id,
      for_trade,
      grader,
      grade,
      cert_number,
      notes,
      cards (
        id,
        game,
        name,
        set_name,
        card_number,
        image_url,
        game_data
      )
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) redirect("/inventory");

  const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
  if (!card) redirect("/inventory");

  // Our own tracked daily snapshots for this card (RLS: owner reads own rows) …
  const { data: histRows } = await supabase
    .from("price_history")
    .select("market_price, snapshotted_at")
    .eq("collection_item_id", id)
    .eq("user_id", user.id)
    .order("snapshotted_at", { ascending: true });
  const ownPoints: PricePoint[] = (histRows ?? []).map((h) => ({
    date: h.snapshotted_at as string,
    value: Number(h.market_price),
  }));

  // … seeded/merged with the provider's own daily history (JustTCG priceHistory),
  // so the chart isn't limited to the window since this card was added.
  const apiId = priceApiId((card as any).game_data ?? {}, (card as any).id);
  const { data: priceRow } = apiId
    ? await supabase.from("card_prices").select("raw").eq("card_api_id", apiId).maybeSingle()
    : { data: null };
  const api = extractApiCardHistory(priceRow?.raw, {
    finish: (item as any).finish ?? null,
    edition: ((card as any).game_data as any)?.edition ?? null,
    condition: item.condition,
    grader: item.grader,
  });

  const valueHistory: PricePoint[] = mergeDailySeries(api?.points ?? [], ownPoints, (item as any).market_price ?? null);

  return (
    <div className="space-y-8">
    <EditCardForm
      item={{
        id:           item.id,
        condition:    item.condition ?? "",
        finish:       (item as any).finish ?? "",
        quantity:     item.quantity,
        paid_price:   item.paid_price ?? null,
        list_price:   (item as any).list_price ?? null,
        market_price: (item as any).market_price ?? null,
        for_sale:     item.for_sale,
        for_trade:  item.for_trade,
        grader:     item.grader ?? "",
        grade:      item.grade ?? null,
        cert_number: item.cert_number ?? "",
        notes:               item.notes ?? "",
        product_purchase_id: (item as any).product_purchase_id ?? null,
      }}
      card={{
        name:        card.name,
        set_name:    card.set_name,
        card_number: card.card_number ?? "",
        game:        card.game,
        image_url:   card.image_url ?? "",
      }}
    />
    {valueHistory.length > 0 && (
      <div id="value-chart" className="scroll-mt-24">
        <CardValueChart data={valueHistory} title="Your Card's Value" />
      </div>
    )}
    </div>
  );
}
