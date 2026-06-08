import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, type, type_value, card_total } = await req.json() as {
    name: string;
    type: "set" | "rarity" | "custom";
    type_value?: string;
    card_total?: number;
  };

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!["set", "rarity", "custom"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .insert({ user_id: user.id, name: name.trim(), type, type_value: type_value ?? null, card_total: card_total ?? null })
    .select("id")
    .single();

  if (collectionError || !collection) {
    return NextResponse.json({ error: collectionError?.message ?? "Failed to create collection" }, { status: 500 });
  }

  // ── Plain Set — populate from this user's own inventory ──────────────────────
  if (type === "set" && type_value) {
    const { data: userItems } = await supabase
      .from("collection_items")
      .select("card_id")
      .eq("user_id", user.id);

    const cardIds = [...new Set((userItems ?? []).map((i) => i.card_id as string).filter(Boolean))];

    if (cardIds.length > 0) {
      const { data: cards } = await supabase
        .from("cards")
        .select("id, name, set_name, card_number, image_url, game_data")
        .in("id", cardIds)
        .eq("set_name", type_value);

      if (cards && cards.length > 0) {
        const seen = new Set<string>();
        const entries: object[] = [];

        for (const c of cards) {
          const apiId = (c.game_data as Record<string, unknown>)?.pokemon_api_id as string | undefined;
          if (!apiId || seen.has(apiId)) continue;
          seen.add(apiId);
          entries.push({
            collection_id:  collection.id,
            pokemon_api_id: apiId,
            card_name:      c.name        ?? "Unknown",
            set_name:       c.set_name    ?? null,
            set_id:         null,
            card_number:    c.card_number ?? null,
            image_url:      c.image_url   ?? null,
            rarity:         (c.game_data as Record<string, unknown>)?.rarity ?? null,
          });
        }

        for (let i = 0; i < entries.length; i += 500) {
          await supabase.from("collection_entries").insert(entries.slice(i, i + 500));
        }
      }
    }
  }

  // ── Rarity — populate from this user's own inventory ─────────────────────────
  if (type === "rarity" && type_value) {
    const { data: userItems } = await supabase
      .from("collection_items")
      .select("card_id")
      .eq("user_id", user.id);

    const cardIds = [...new Set((userItems ?? []).map((i) => i.card_id as string).filter(Boolean))];

    if (cardIds.length > 0) {
      const { data: cards } = await supabase
        .from("cards")
        .select("id, name, set_name, card_number, image_url, game_data")
        .in("id", cardIds)
        .contains("game_data", { rarity: type_value });

      if (cards && cards.length > 0) {
        const seen = new Set<string>();
        const entries: object[] = [];

        for (const c of cards) {
          const apiId = (c.game_data as Record<string, unknown>)?.pokemon_api_id as string | undefined;
          if (!apiId || seen.has(apiId)) continue;
          seen.add(apiId);
          entries.push({
            collection_id:  collection.id,
            pokemon_api_id: apiId,
            card_name:      c.name        ?? "Unknown",
            set_name:       c.set_name    ?? null,
            set_id:         null,
            card_number:    c.card_number ?? null,
            image_url:      c.image_url   ?? null,
            rarity:         (c.game_data as Record<string, unknown>)?.rarity ?? null,
          });
        }

        for (let i = 0; i < entries.length; i += 500) {
          await supabase.from("collection_entries").insert(entries.slice(i, i + 500));
        }
      }
    }
  }

  return NextResponse.json({ id: collection.id });
}
