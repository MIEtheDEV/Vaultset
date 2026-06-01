/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { timeAgo } from "@/lib/timeAgo";

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
    .select("id, card_name, set_name, card_number, image_url, rarity, notes, revealed_at, user_id, product_purchase_id")
    .eq("visibility", "public")
    .order("revealed_at", { ascending: false })
    .limit(60);

  const userIds = [...new Set((reveals ?? []).map((r) => r.user_id as string))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, username, avatar_color").in("id", userIds)
    : { data: [] as { id: string; username: string; avatar_color: string | null }[] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const myReveals = (reveals ?? []).filter((r) => r.user_id === user.id).length;

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
          {myReveals > 0 && (
            <Link
              href="/reveals/mine"
              className="text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              My reveals ({myReveals})
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
        <div className="rounded-2xl border border-border bg-surface py-24 text-center space-y-3">
          <p className="text-sm text-foreground-muted">No reveals logged yet. Be the first!</p>
          <Link href="/reveals/log" className="inline-block text-sm text-gold hover:underline">
            Log a pull →
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(reveals ?? []).map((reveal) => {
            const profile = profileMap.get(reveal.user_id as string);
            return (
              <div key={reveal.id} className="rounded-2xl border border-border bg-surface overflow-hidden">
                {reveal.image_url ? (
                  <div className="relative aspect-[2.5/3.5] w-full bg-surface-raised">
                    <Image
                      src={reveal.image_url}
                      alt={reveal.card_name as string}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <div className="aspect-[2.5/3.5] w-full bg-surface-raised flex items-center justify-center text-foreground-muted">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                    </svg>
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <div>
                    <p className="font-semibold text-foreground text-sm leading-tight">{reveal.card_name as string}</p>
                    <p className="text-xs text-foreground-muted mt-0.5">
                      {reveal.set_name as string ?? ""}
                      {reveal.card_number ? ` · #${reveal.card_number}` : ""}
                    </p>
                    {reveal.rarity && (
                      <p className="text-xs text-foreground-muted capitalize">{(reveal.rarity as string).replace(/_/g, " ")}</p>
                    )}
                  </div>
                  {reveal.notes && (
                    <p className="text-xs text-foreground-muted italic line-clamp-2">{reveal.notes as string}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Link
                      href={`/profile/${profile?.username ?? ""}`}
                      className="text-xs text-gold hover:underline"
                    >
                      @{profile?.username ?? "unknown"}
                    </Link>
                    <span className="text-xs text-foreground-muted">{timeAgo(reveal.revealed_at as string)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
