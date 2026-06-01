import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://vaultset.app";
  const now  = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: base,                  lastModified: now, changeFrequency: "weekly",  priority: 1   },
    { url: `${base}/marketplace`, lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${base}/community`,   lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${base}/privacy`,                        changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`,                          changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/contact`,                        changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const [{ data: profiles }, { data: listings }] = await Promise.all([
      supabase.from("profiles").select("username, created_at"),
      supabase
        .from("collection_items")
        .select("id, created_at")
        .or("for_sale.eq.true,for_trade.eq.true")
        .eq("on_hold", false),
    ]);

    const profilePages: MetadataRoute.Sitemap = (profiles ?? []).map((p) => ({
      url:             `${base}/profile/${p.username}`,
      lastModified:    new Date(p.created_at),
      changeFrequency: "weekly" as const,
      priority:        0.7,
    }));

    const listingPages: MetadataRoute.Sitemap = (listings ?? []).map((l) => ({
      url:             `${base}/marketplace/${l.id}`,
      lastModified:    new Date(l.created_at),
      changeFrequency: "weekly" as const,
      priority:        0.6,
    }));

    return [...staticPages, ...profilePages, ...listingPages];
  } catch {
    return staticPages;
  }
}
