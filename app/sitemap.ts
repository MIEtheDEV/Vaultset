import type { MetadataRoute } from "next";
import { createAdminClient } from "@/utils/supabase/admin";
import { distinctSetCodes, distinctRarities, distinctSpecies, distinctListedSetCodes, distinctListedSpecies } from "@/lib/hubs/hubQueries";

// Rebuilt daily; the hub enumerators read the daily-cached catalog snapshot, so
// this stays cheap. (Well under the 50k-URL sitemap cap today; if the catalog
// grows past it, split via generateSitemaps().)
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://www.vaultset.app";
  const now  = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: base,                              lastModified: now, changeFrequency: "weekly",  priority: 1   },
    { url: `${base}/marketplace`,             lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${base}/card-data`,               lastModified: now, changeFrequency: "daily",   priority: 0.8 },
    { url: `${base}/sets`,                    lastModified: now, changeFrequency: "daily",   priority: 0.8 },
    { url: `${base}/most-valuable-pokemon-cards`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/community`,               lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${base}/pricing`,                 lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/reviews`,                 lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`,                                    changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`,                                      changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/contact`,                                    changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const supabase = createAdminClient();

    const [{ data: profiles }, { data: pricedCards }, setCodes, rarities, species, listedSets, listedSpecies] = await Promise.all([
      supabase.from("profiles").select("username, created_at").eq("banned", false),
      supabase.from("card_prices").select("card_api_id, updated_at"),
      distinctSetCodes(),
      distinctRarities(),
      distinctSpecies(),
      distinctListedSetCodes(),
      distinctListedSpecies(),
    ]);

    const profilePages: MetadataRoute.Sitemap = (profiles ?? []).map((p) => ({
      url:             `${base}/profile/${p.username}`,
      lastModified:    new Date(p.created_at),
      changeFrequency: "weekly" as const,
      priority:        0.7,
    }));

    // Public card-data pages — one per cached catalog card (skip user-specific `manual:` keys).
    const cardPages: MetadataRoute.Sitemap = (pricedCards ?? [])
      .filter((c) => !String(c.card_api_id).startsWith("manual:"))
      .map((c) => ({
        url:             `${base}/card-data/${encodeURIComponent(c.card_api_id)}`,
        lastModified:    c.updated_at ? new Date(c.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority:        0.6,
      }));

    const hub = (path: string, priority: number): MetadataRoute.Sitemap[number] =>
      ({ url: `${base}${path}`, lastModified: now, changeFrequency: "weekly" as const, priority });

    const setPages       = setCodes.map((c) => hub(`/sets/${encodeURIComponent(c)}`, 0.7));
    const rarityPages    = rarities.map((r) => hub(`/rarity/${encodeURIComponent(r)}`, 0.6));
    const speciesPages   = species.map((s) => hub(`/pokemon/${encodeURIComponent(s)}`, 0.6));
    const mpSetPages     = listedSets.map((c) => hub(`/marketplace/sets/${encodeURIComponent(c)}`, 0.7));
    const mpSpeciesPages = listedSpecies.map((s) => hub(`/marketplace/pokemon/${encodeURIComponent(s)}`, 0.6));

    return [
      ...staticPages, ...profilePages, ...cardPages,
      ...setPages, ...rarityPages, ...speciesPages,
      ...mpSetPages, ...mpSpeciesPages,
    ];
  } catch {
    return staticPages;
  }
}
