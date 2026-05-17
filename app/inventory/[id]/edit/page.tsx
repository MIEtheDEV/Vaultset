import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { EditCardForm } from "@/components/EditCardForm";

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
      for_sale,
      product_purchase_id,
      for_trade,
      grader,
      grade,
      cert_number,
      notes,
      cards (
        game,
        name,
        set_name,
        card_number,
        image_url
      )
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) redirect("/inventory");

  const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
  if (!card) redirect("/inventory");

  return (
    <EditCardForm
      item={{
        id:         item.id,
        condition:  item.condition ?? "",
        finish:     (item as any).finish ?? "",
        quantity:   item.quantity,
        paid_price: item.paid_price ?? null,
        list_price: (item as any).list_price ?? null,
        for_sale:   item.for_sale,
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
  );
}
