import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ProductCardLinker } from "@/components/ProductCardLinker";

export default async function LinkCardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: product } = await supabase
    .from("product_purchases")
    .select("id, name, product_type")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!product) redirect("/inventory/products");

  const { data: items } = await supabase
    .from("collection_items")
    .select(`
      id, product_purchase_id,
      condition, grader, grade, quantity,
      cards ( name, set_name, card_number, image_url, game_data )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <ProductCardLinker
      product={{ id: product.id, name: product.name }}
      items={(items ?? []).map((item) => {
        const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
        return {
          id:                  item.id,
          linked:              item.product_purchase_id === id,
          condition:           item.condition,
          grader:              item.grader,
          grade:               item.grade,
          quantity:            item.quantity,
          name:                card?.name ?? "—",
          set_name:            card?.set_name ?? "—",
          card_number:         card?.card_number ?? null,
          image_url:           card?.image_url ?? null,
          is_promo:            !!(card?.game_data as any)?.is_promo,
        };
      })}
    />
  );
}
