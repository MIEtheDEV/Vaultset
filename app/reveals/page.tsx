import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { RevealGroupTile, groupReveals } from "@/components/RevealGroupTile";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "Pack Reveals",
  robots: { index: false },
};

export default async function RevealsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: reveals } = await admin
    .from("pack_reveals")
    .select("id, card_name, set_name, card_number, image_url, rarity, notes, revealed_at, user_id, product_purchase_id, reveal_group_id")
    .eq("visibility", "public")
    .order("revealed_at", { ascending: false })
    .limit(150);

  const groups = groupReveals(reveals ?? []);

  const userIds = [...new Set((reveals ?? []).map((r) => r.user_id as string))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, username, avatar_color").in("id", userIds)
    : { data: [] as { id: string; username: string; avatar_color: string | null }[] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Does the user have any reveals of their own (any visibility)? Gates the "My reveals" link.
  const { count: myRevealCount } = await supabase
    .from("pack_reveals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const hasMyReveals = (myRevealCount ?? 0) > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pack Reveals</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            See what the community has been pulling.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasMyReveals && (
            <Link
              href="/reveals/mine"
              className="text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              My reveals
            </Link>
          )}
          <Link
            href="/reveals/log"
            className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
          >
            + Log a Pull
          </Link>
        </div>
      </div>

      {(!reveals || reveals.length === 0) ? (
        <EmptyState
          size="lg"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 15 8l6 .9-4.5 4.3 1.1 6.1L12 16.5 6.4 19.3l1.1-6.1L3 8.9 9 8z" />
            </svg>
          }
          title="No reveals logged yet"
          description="Log what you pull from a pack and it shows up here for the community to see."
          cta="Log a pull"
          href="/reveals/log"
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const profile = profileMap.get(group.items[0].user_id as string);
            return (
              <RevealGroupTile
                key={group.key}
                items={group.items}
                identity={
                  <Link href={`/profile/${profile?.username ?? ""}`} className="text-xs text-gold hover:underline">
                    @{profile?.username ?? "unknown"}
                  </Link>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
