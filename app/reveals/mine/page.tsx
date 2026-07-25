import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { RevealGroupTile, groupReveals } from "@/components/RevealGroupTile";

export const metadata: Metadata = {
  title: "My Reveals",
  robots: { index: false },
};

export default async function MyRevealsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Own reveals across all visibilities — RLS scopes this to the current user.
  const { data: reveals } = await supabase
    .from("pack_reveals")
    .select("id, card_name, set_name, card_number, image_url, rarity, notes, revealed_at, visibility, reveal_group_id")
    .eq("user_id", user.id)
    .order("revealed_at", { ascending: false })
    .limit(200);

  const groups = groupReveals(reveals ?? []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Reveals</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Every pull you&apos;ve logged{groups.length > 0 ? ` — ${groups.length} total` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/reveals" className="text-sm text-foreground-muted hover:text-foreground transition-colors">
            ← Community feed
          </Link>
          <Link
            href="/reveals/log"
            className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
          >
            + Log a Pull
          </Link>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-24 text-center space-y-3">
          <p className="text-sm text-foreground-muted">You haven&apos;t logged any reveals yet.</p>
          <Link href="/reveals/log" className="inline-block text-sm text-gold hover:underline">
            Log your first pull →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const isPublic = group.items[0].visibility === "public";
            return (
              <RevealGroupTile
                key={group.key}
                items={group.items}
                identity={
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      isPublic
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border border-border text-foreground-muted"
                    }`}
                  >
                    {isPublic ? "Public" : "Private"}
                  </span>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
