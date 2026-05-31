import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/inventory/",
          "/account/",
          "/api/",
          "/marketplace/",
          "/community/",
          "/messages/",
          "/offers/",
          "/wishlist/",
        ],
      },
    ],
    sitemap: "https://vaultset.app/sitemap.xml",
  };
}
