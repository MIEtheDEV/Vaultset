import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is a native module used server-side by the card scanner's image
  // hashing (lib/scan/imageHash). It must NOT be bundled — bundling breaks its
  // native binaries on Vercel's serverless runtime, which fails the whole
  // /api/card-scan route module (including its GET handler that gates the scan
  // button). Keep it external so the prebuilt binary loads at runtime.
  serverExternalPackages: ["sharp"],
  images: {
    // Card art is immutable — a given card's image never changes — so cache
    // each optimized variant for a month instead of Vercel's 1h default. A
    // "cache write" is billed on every miss AND every stale revalidation, so a
    // short TTL re-writes still-viewed images hourly. 31 days ≈ one write per
    // variant per month (Vercel's own recommended value for static imagery).
    minimumCacheTTL: 2678400,
    // Trim the generated-variant pool to what we actually render. Source images
    // (pokemontcg.io ~600–745px wide, TCGplayer CDN similar) are small, so the
    // default deviceSizes up to 3840px only burn cache writes for widths no
    // card can fill. Fixed thumbnails run 24–256px (→ imageSizes); the widest
    // layout is the listing photo at 100vw/50vw (→ deviceSizes, capped at 1200).
    // Fewer candidate widths also means different `sizes` contexts collapse onto
    // shared variants, improving cache reuse.
    deviceSizes: [640, 828, 1200],
    imageSizes: [48, 96, 128, 256, 384],
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
