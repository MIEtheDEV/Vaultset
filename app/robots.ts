import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Only truly private / user-specific areas are disallowed. Public SEO
        // surfaces — /marketplace (browse), /marketplace/user, /marketplace/sets,
        // /marketplace/pokemon, /community, /card-data, /sets, /rarity, /pokemon —
        // are intentionally crawlable. (The gated /marketplace/<listing> detail
        // just 302s to /login, so it needs no explicit block.)
        disallow: [
          "/dashboard/",
          "/inventory/",
          "/account/",
          "/api/",
          "/messages/",
          "/offers/",
          "/wishlist/",
          "/transactions/",
          "/notifications/",
          "/reveals/",
          "/showcase/",
          "/admin/",
          "/auth/",
        ],
      },
    ],
    sitemap: "https://vaultset.app/sitemap.xml",
  };
}
