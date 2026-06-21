import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";
import { InventoryExport, type ExportRow } from "@/components/InventoryExport";
import { ProUpsell } from "@/components/ProUpsell";
import { isPro } from "@/lib/isPro";

export const metadata: Metadata = {
  title: "Export Inventory",
  robots: { index: false },
};

const raritySystem = new PokemonRaritySystem();

const ExportHeader = () => (
  <div className="flex items-center gap-4">
    <Link href="/inventory" className="text-foreground-muted hover:text-foreground transition-colors">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
      </svg>
    </Link>
    <div>
      <h1 className="text-2xl font-bold text-foreground">Export Inventory</h1>
      <p className="mt-0.5 text-sm text-foreground-muted">
        Download your collection as a CSV — full record, or a tax or insurance format.
      </p>
    </div>
  </div>
);

const CONDITION_LABEL: Record<string, string> = {
  mint: "Mint", near_mint: "Near Mint", lightly_played: "Lightly Played",
  moderately_played: "Moderately Played", heavily_played: "Heavily Played", damaged: "Damaged",
};
const FINISH_LABEL: Record<string, string> = {
  non_holo: "Non-Holo", holofoil: "Holofoil", reverse_holofoil: "Reverse Holofoil",
  textured_holofoil: "Textured Holofoil", gold_etched: "Gold Etched",
};
const VARIANT_LABEL: Record<string, string> = {
  standard_ex: "Standard ex", full_art: "Full Art",
  illustration_rare: "Illustration Rare (Alt Art)", special_illustration_rare: "Special Illustration Rare (Alt Art ex)",
  gold_card: "Gold Card", secret_rare: "Secret Rare", standard_holo: "Standard Holo",
  standard_v: "Standard V", vmax: "VMAX", vstar: "VSTAR",
  rainbow_rare: "Rainbow Rare", shiny_rare: "Shiny Rare", shiny_gx: "Shiny GX", ace_spec: "ACE SPEC",
};

export default async function InventoryExportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Bulk export is a Pro feature.
  if (!(await isPro(user.id))) {
    return (
      <div className="space-y-6">
        <ExportHeader />
        <ProUpsell
          title="Bulk CSV export"
          description="Export your full collection as CSV — including ready-made tax cost-basis and insurance-inventory presets — with Pro."
        />
      </div>
    );
  }

  const username = user.user_metadata?.username as string;

  const { data: items } = await supabase
    .from("collection_items")
    .select(`
      id, condition, finish, quantity, paid_price, list_price, market_price,
      for_sale, for_trade, grader, grade, cert_number, notes, created_at,
      cards ( game, name, set_name, card_number, game_data )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const rows: ExportRow[] = (items ?? [])
    .map((item) => {
      const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
      const gd   = (card?.game_data ?? {}) as Record<string, unknown>;
      return {
        date_added:  item.created_at as string,
        name:        card?.name ?? "",
        set_name:    card?.set_name ?? "",
        card_number: card?.card_number ?? "",
        game:        card?.game ?? "",
        rarity:      raritySystem.getDisplayLabel((gd.rarity as string) ?? ""),
        variant:     VARIANT_LABEL[(gd.variant as string) ?? ""] ?? (gd.variant as string) ?? "",
        finish:      FINISH_LABEL[item.finish ?? ""] ?? "",
        condition:   item.grader
                       ? `${item.grader} ${item.grade}`
                       : CONDITION_LABEL[item.condition ?? ""] ?? "",
        cert_number: item.cert_number ?? "",
        quantity:    item.quantity,
        paid_unit:   item.paid_price   != null ? Number(item.paid_price)   : null,
        market_unit: item.market_price != null ? Number(item.market_price) : null,
        list_unit:   item.list_price   != null ? Number(item.list_price)   : null,
        for_sale:    !!item.for_sale,
        for_trade:   !!item.for_trade,
        notes:       item.notes ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <ExportHeader />

      <InventoryExport rows={rows} username={username} />
    </div>
  );
}
