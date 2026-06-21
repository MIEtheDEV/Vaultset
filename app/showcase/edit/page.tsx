import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ShowcaseEditor, type ShowcaseItem } from "@/components/ShowcaseEditor";
import { hasProAccess } from "@/lib/proStatus";

export const metadata: Metadata = {
  title: "Edit Showcase",
  robots: { index: false },
};

export default async function ShowcaseEditPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const username = user.user_metadata?.username as string;

  const [
    { data: inventoryItems },
    { data: showcaseItems },
    { data: profileRow },
  ] = await Promise.all([
    supabase
      .from("collection_items")
      .select(`
        id, condition, grader, grade,
        cards ( name, set_name, card_number, image_url )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("profile_showcase")
      .select("collection_item_id")
      .eq("user_id", user.id),

    supabase
      .from("profiles")
      .select("showcase_border, is_pro, pro_plan, pro_expires_at, pro_auto_renews")
      .eq("id", user.id)
      .single(),
  ]);

  const initialBorder = ((profileRow as any)?.showcase_border as string | null) ?? "none";
  const canPro = hasProAccess(profileRow as any);

  const showcasedIds = new Set((showcaseItems ?? []).map((s) => s.collection_item_id));

  const items: ShowcaseItem[] = (inventoryItems ?? []).map((item) => {
    const raw  = (item as any).cards;
    const card = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    return {
      id:          item.id,
      name:        card?.name        ?? "Unknown Card",
      set_name:    card?.set_name    ?? null,
      card_number: card?.card_number ?? null,
      image_url:   card?.image_url   ?? null,
      condition:   (item as any).condition ?? null,
      grader:      (item as any).grader    ?? null,
      grade:       (item as any).grade     ?? null,
      showcased:   showcasedIds.has(item.id),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/profile/${username}`}
          className="text-sm text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Back to profile
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Edit Showcase</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Pin up to 12 cards from your collection to display on your public profile.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center">
          <p className="text-sm text-foreground-muted">Add cards to your inventory first.</p>
          <Link
            href="/inventory/add"
            className="mt-3 inline-block rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
          >
            Add a card
          </Link>
        </div>
      ) : (
        <ShowcaseEditor userId={user.id} initialItems={items} initialBorder={initialBorder} canPro={canPro} />
      )}
    </div>
  );
}
