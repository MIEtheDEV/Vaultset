import type { MetadataRoute } from "next";

// Only truly private / user-specific areas are disallowed. Public SEO surfaces —
// /marketplace (browse), /marketplace/user, /marketplace/sets, /marketplace/pokemon,
// /community, /card-data, /sets, /rarity, /pokemon — are intentionally crawlable.
// (The gated /marketplace/<listing> detail just 302s to /login, so it needs no block.)
const PRIVATE = [
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
];

// AI-crawler policy. Answer/search engines drive discovery ("where can I check a
// Charizard's value?") so they're welcome on the same public surfaces as Googlebot.
// Pure training-only scrapers with no user-facing referral upside are blocked. To
// flip a bot, move it between the two lists. (A missing bot falls under `*` = allowed.)
const AI_ANSWER_ENGINES = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",   // OpenAI
  "ClaudeBot", "Claude-Web", "anthropic-ai",   // Anthropic
  "PerplexityBot", "Perplexity-User",          // Perplexity
  "Google-Extended",                            // Gemini / AI Overviews
  "Applebot-Extended",                          // Apple Intelligence
];
const AI_TRAINING_SCRAPERS = ["CCBot", "Bytespider"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_ANSWER_ENGINES, allow: "/", disallow: PRIVATE },
      { userAgent: AI_TRAINING_SCRAPERS, disallow: "/" },
    ],
    sitemap: "https://www.vaultset.app/sitemap.xml",
  };
}
