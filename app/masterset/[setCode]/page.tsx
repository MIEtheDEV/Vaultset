import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { loadOwnedIndex, getMasterSetView } from "@/lib/sets/masterset";
import { splitSecretRares } from "@/lib/sets/setDisplay";
import { recordAndAwardCompletion } from "@/lib/sets/setCompletion";
import { MasterSetGrid } from "@/components/masterset/MasterSetGrid";

export const metadata: Metadata = { title: "Master Set", robots: { index: false } };

export default async function MasterSetDetailPage({
  params,
}: {
  params: Promise<{ setCode: string }>;
}) {
  const { setCode: raw } = await params;
  const setCode = decodeURIComponent(raw);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const ownedIndex = await loadOwnedIndex(supabase, user!.id);
  const view = await getMasterSetView(supabase, setCode, ownedIndex);
  if (!view) notFound();

  // Lazily award set/master-set completion achievements on view (idempotent).
  await recordAndAwardCompletion(supabase, user!.id, view);

  return (
    <div className="space-y-8">
      <nav className="text-sm text-foreground-muted">
        <Link href="/masterset" className="hover:text-foreground transition-colors">Master Sets</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{view.setName}</span>
      </nav>

      <div className="flex items-center gap-4">
        {view.logo && (
          <div className="relative h-14 w-24 shrink-0">
            <Image src={view.logo} alt={view.setName} fill sizes="96px" className="object-contain" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-foreground">{view.setName}</h1>
          {(() => {
            const { regular, secret } = splitSecretRares(view.complete.total, view.printedTotal);
            return (
              <p className="mt-1 text-sm text-foreground-muted">
                {view.series ? `${view.series} · ` : ""}
                {regular} cards{secret > 0 ? ` + ${secret} secret rare${secret !== 1 ? "s" : ""}` : ""}
                {view.releaseDate ? ` · released ${view.releaseDate}` : ""}
              </p>
            );
          })()}
        </div>
      </div>

      <MasterSetGrid
        cards={view.cards}
        complete={view.complete}
        master={view.master}
        rarities={view.rarities}
        hasPartial={view.hasPartial}
      />
    </div>
  );
}
