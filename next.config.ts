import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pokemontcg.io",
      },
      {
        protocol: "https",
        hostname: "images.scrydex.com",
      },
      {
        protocol: "https",
        hostname: "**.pokemontcg.io",
      },
      // JustTCG-sourced cards use TCGplayer's image CDN.
      {
        protocol: "https",
        hostname: "tcgplayer-cdn.tcgplayer.com",
      },
      {
        protocol: "https",
        hostname: "product-images.tcgplayer.com",
      },
    ],
  },
};

export default nextConfig;
