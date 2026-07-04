import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CollectionEntryRemover } from "@/components/CollectionEntryRemover";
import { CollectionDeleter } from "@/components/CollectionDeleter";

export const metadata: Metadata = { title: "Collection", robots: { index: false } };

const TYPE_LABELS: Record<string, string> = {
  set:    "Set",
  rarity: "Rarity",
  custom: "Custom",
};

const TYPE_COLORS: Record<string, string> = {
  set:    "border-blue-500/30 bg-blue-500/10 text-blue-400",
  rarity: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  custom: "border-border bg-surface-raised text-foreground-muted",
};

const RARITY_LABELS: Record<string, string> = {
  common:                    "Common",
  uncommon:                  "Uncommon",
  rare:                      "Rare",
  rare_holo:                 "Rare Holo",
  ace_spec_rare:             "ACE SPEC Rare",
  double_rare:               "Double Rare",
  ultra_rare:                "Ultra Rare",
  illustration_rare:         "Illustration Rare",
  special_illustration_rare: "Special Illustration Rare",
  hyper_rare:                "Mega Hyper Rare",
  secret_rare:               "Secret Rare",
  rare_holo_v:               "Rare Holo V",
  rare_holo_vmax:            "Rare Holo VMAX",
  rare_holo_vstar:           "Rare Holo VSTAR",
  rare_ultra:                "Rare Ultra",
  rare_rainbow:              "Rare Rainbow",
  rare_secret:               "Rare Secret",
  rare_shiny:                "Rare Shiny",
  rare_shiny_gx:             "Rare Shiny GX",
  promo:                     "Promo",
};

type CollectionEntry = {
  id: string;
  pokemon_api_id: string;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  rarity: string | null;
};

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: collectionRaw },
    { data: entriesRaw },
  ] = await Promise.all([
    supabase
      .from("collections")
      .select("id, user_id, name, type, type_value, card_total, created_at")
      .eq("id", id)
      .single(),
    supabase
      .from("collection_entries")
      .select("id, pokemon_api_id, card_name, set_name, card_number, image_url, rarity")
      .eq("collection_id", id)
      .order("card_number"),
  ]);

  if (!collectionRaw) notFound();

  const collection = collectionRaw as typeof collectionRaw & { card_total: number | null };
  const entries    = (entriesRaw ?? []) as CollectionEntry[];
  const isOwner    = user?.id === collection.user_id;

  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", collection.user_id)
    .single();

  const totalCount = entries.length;
  const profileHref = ownerProfile ? `/profile/${ownerProfile.username}` : "/";

  const typeValueDisplay = collection.type_value
    ? collection.type === "rarity"
      ? (RARITY_LABELS[collection.type_value] ?? collection.type_value)
      : collection.type_value
    : null;

  return (
    <div className="space-y-6">

      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          href={profileHref}
          className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors w-fit"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          {ownerProfile ? `@${ownerProfile.username}` : "Profile"}
        </Link>

        {isOwner && (
          <CollectionDeleter collectionId={collection.id} redirectTo={profileHref} />
        )}
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[collection.type] ?? TYPE_COLORS.custom}`}>
                {TYPE_LABELS[collection.type] ?? collection.type}
              </span>
              {typeValueDisplay && collection.type !== "custom" && (
                <span className="text-xs text-foreground-muted">{typeValueDisplay}</span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-foreground leading-tight">{collection.name}</h1>
          </div>

          <div className="text-right shrink-0">
            {collection.type === "set" && collection.card_total ? (
              <>
                <p className="text-3xl font-bold text-gold tabular-nums">
                  {totalCount}
                  <span className="text-xl text-foreground-muted font-normal">/{collection.card_total}</span>
                </p>
                <p className="text-xs text-foreground-muted mt-0.5">cards owned</p>
              </>
            ) : (
              <>
                <p className="text-4xl font-bold text-gold tabular-nums">{totalCount}</p>
                <p className="text-xs text-foreground-muted mt-0.5">{totalCount === 1 ? "card" : "cards"}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Card grid */}
      {totalCount === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-20 flex flex-col items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted opacity-40">
            <rect x="2" y="5" width="14" height="18" rx="2" /><rect x="8" y="1" width="14" height="18" rx="2" />
          </svg>
          <p className="text-sm text-foreground-muted">No cards in this collection yet.</p>
          {isOwner && (
            <p className="text-xs text-foreground-muted opacity-60">
              Cards are pulled from your inventory when you create a set or rarity collection.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-border bg-surface hover:border-gold/40 flex flex-col gap-2 p-2 transition-colors"
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised">
                {entry.image_url ? (
                  <Image
                    src={entry.image_url}
                    alt={entry.card_name}
                    fill
                    sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 20vw, (max-width: 1280px) 16vw, 12vw"
                    className="object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-foreground-muted text-base font-bold opacity-30">
                    {entry.card_name[0]}
                  </div>
                )}
              </div>

              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-foreground truncate leading-tight">{entry.card_name}</p>
                {entry.card_number && (
                  <p className="text-xs text-foreground-muted">#{entry.card_number}</p>
                )}
              </div>

              {isOwner && (
                <CollectionEntryRemover entryId={entry.id} collectionId={collection.id} />
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
