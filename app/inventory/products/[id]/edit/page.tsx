import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ProductForm } from "@/components/ProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: product } = await supabase
    .from("product_purchases")
    .select("id, name, product_type, cost, purchased_at, notes, status, for_sale, for_trade, list_price, tcgplayer_id, set_name, image_url, market_value")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!product) redirect("/inventory/products");

  return (
    <ProductForm
      initial={{
        id:           product.id,
        name:         product.name,
        product_type: product.product_type,
        cost:         Number(product.cost),
        purchased_at: product.purchased_at,
        notes:        product.notes ?? "",
        status:    (product as any).status    ?? "sealed",
        for_sale:  (product as any).for_sale  ?? false,
        for_trade: (product as any).for_trade ?? false,
        list_price: (product as any).list_price != null ? Number((product as any).list_price) : null,
        tcgplayer_id: (product as any).tcgplayer_id ?? null,
        set_name:     (product as any).set_name ?? null,
        image_url:    (product as any).image_url ?? null,
        market_value: (product as any).market_value != null ? Number((product as any).market_value) : null,
      }}
    />
  );
}
