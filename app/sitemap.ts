import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://vaultset.app";
  const now  = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: base,                  lastModified: now, changeFrequency: "weekly",  priority: 1   },
    { url: `${base}/privacy`,                        changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`,                          changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/contact`,                        changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data: profiles } = await supabase
      .from("profiles")
      .select("username");

    const profilePages: MetadataRoute.Sitemap = (profiles ?? []).map((p) => ({
      url:             `${base}/profile/${p.username}`,
      lastModified:    now,
      changeFrequency: "weekly" as const,
      priority:        0.7,
    }));

    return [...staticPages, ...profilePages];
  } catch {
    return staticPages;
  }
}
