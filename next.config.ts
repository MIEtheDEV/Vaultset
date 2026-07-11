import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is a native module used server-side by the card scanner's image
  // hashing (lib/scan/imageHash). It must NOT be bundled — bundling breaks its
  // native binaries on Vercel's serverless runtime, which fails the whole
  // /api/card-scan route module (including its GET handler that gates the scan
  // button). Keep it external so the prebuilt binary loads at runtime.
  serverExternalPackages: ["sharp"],
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
  async headers() {
    // Baseline hardening headers applied to every route. A full
    // Content-Security-Policy is intentionally omitted here — it needs to be
    // tuned against Next.js inline scripts, Stripe, and Supabase before it can
    // be enforced without breaking the app.
    const securityHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // camera=(self) so the card scanner can open a live camera stream
      // (getUserMedia) for burst capture; mic/geolocation stay disabled.
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
