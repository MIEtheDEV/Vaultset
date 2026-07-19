import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is a native module used server-side by the card scanner's image
  // hashing (lib/scan/imageHash). It must NOT be bundled — bundling breaks its
  // native binaries on Vercel's serverless runtime, which fails the whole
  // /api/card-scan route module (including its GET handler that gates the scan
  // button). Keep it external so the prebuilt binary loads at runtime.
  serverExternalPackages: ["sharp"],
  images: {
    // Vercel Image Optimization is DISABLED site-wide. As a card platform we
    // proxy thousands of third-party images (pokemontcg.io / TCGplayer CDN)
    // through next/image; on the Hobby plan that blows past the metered
    // optimizer quota, after which uncached variants return 402 and images
    // break on mobile (which requests wider DPR variants than desktop). The
    // source CDNs already serve reasonably-sized images over fast edges, so we
    // serve them directly instead of re-optimizing. next/image still handles
    // layout / lazy-loading / priority — it just emits the original URL.
    //   Re-enabling optimization later = remove `unoptimized` (and upgrade the
    //   Vercel plan, or the 402s return). The hero uses its own pre-generated
    //   static WebPs, so it stays crisp regardless.
    unoptimized: true,
    // NOTE: minimumCacheTTL / deviceSizes / imageSizes only affect the
    // optimizer, so they are inert while `unoptimized` is on. Kept so the tuned
    // values are ready if optimization is ever re-enabled.
    minimumCacheTTL: 2678400,
    deviceSizes: [640, 828, 1200],
    imageSizes: [48, 96, 128, 256, 384],
    // remotePatterns still gates which hostnames next/image will render.
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
