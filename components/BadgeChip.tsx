import type { BadgeMeta } from "@/lib/badges";
import { timeAgo } from "@/lib/timeAgo";

// Pointy-top hexagon: 52w × 60h viewBox
const HEX_POINTS = "26,2 50,15 50,45 26,58 2,45 2,15";

const SVG_COLORS: Record<
  BadgeMeta["color"],
  { bg: string; ring: string; icon: string; glow: string }
> = {
  emerald: { bg: "#041a0d", ring: "#22c55e", icon: "#4ade80", glow: "#22c55e33" },
  blue:    { bg: "#050f26", ring: "#3b82f6", icon: "#60a5fa", glow: "#3b82f633" },
  purple:  { bg: "#0f0520", ring: "#a855f7", icon: "#c084fc", glow: "#a855f733" },
  gold:    { bg: "#1a0f02", ring: "#e8b84b", icon: "#f0ca6b", glow: "#e8b84b33" },
  amber:   { bg: "#1a0c00", ring: "#f59e0b", icon: "#fbbf24", glow: "#f59e0b33" },
  pink:    { bg: "#1a0510", ring: "#ec4899", icon: "#f472b6", glow: "#ec489933" },
  teal:    { bg: "#011a18", ring: "#14b8a6", icon: "#2dd4bf", glow: "#14b8a633" },
};

const LOCKED = { bg: "#0c1020", ring: "#1e2440", icon: "#252d45", glow: "transparent" };

const BADGE_ICONS: Record<string, React.ReactNode> = {
  // ── EXISTING ────────────────────────────────────────────────────────────────
  first_card: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <line x1="2" y1="9" x2="22" y2="9" />
    </>
  ),
  collector: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </>
  ),
  century: (
    // trophy cup
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </>
  ),
  first_listing: (
    <>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" strokeLinecap="round" strokeWidth="3" />
    </>
  ),
  active_seller: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </>
  ),
  trader: (
    <>
      <polyline points="17,1 21,5 17,9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7,23 3,19 7,15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  graded: (
    <>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </>
  ),
  high_roller: (
    <>
      <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
      <polyline points="2,8.5 12,15 22,8.5" />
      <line x1="12" y1="15" x2="12" y2="22" />
    </>
  ),
  rising_star: (
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
  ),
  community: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),

  // ── COLLECTION SIZE ──────────────────────────────────────────────────────────
  thousand: (
    // infinity symbol = endless collecting
    <path d="M12 12c-2-2.5-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.5 6-4zm0 0c2 2.5 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.5-6 4z" />
  ),
  crown_collector: (
    // crown
    <path d="M2 20h20M5 20V9l5.5 5L12 5l1.5 9 5.5-5v11" />
  ),

  // ── COLLECTION VALUE ─────────────────────────────────────────────────────────
  portfolio_builder: (
    // bar chart (growing)
    <>
      <line x1="6" y1="20" x2="6" y2="16" />
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </>
  ),
  high_stakes: (
    // lightning bolt
    <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
  ),
  vault_guardian: (
    // shield + checkmark
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),

  // ── GRADING ──────────────────────────────────────────────────────────────────
  grading_enthusiast: (
    // magnifying glass with + (examine closely)
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
      <line x1="11" y1="8" x2="11" y2="14" />
    </>
  ),
  grading_expert: (
    // document with checkmark
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <polyline points="9,15 11,17 15,13" />
    </>
  ),
  perfect_grade: (
    // star burst (10-point perfect score)
    <polygon points="12,2 14.5,9 22,9 16,13.5 18.5,21 12,17 5.5,21 8,13.5 2,9 9.5,9" />
  ),

  // ── SEALED PRODUCTS ──────────────────────────────────────────────────────────
  sealed_collector: (
    // 3D box / package
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <line x1="3.27" y1="6.96" x2="12" y2="12.01" />
      <line x1="20.73" y1="6.96" x2="12" y2="12.01" />
      <line x1="12" y1="22.08" x2="12" y2="12.01" />
    </>
  ),
  box_hoarder: (
    // pyramid of boxes
    <>
      <rect x="2" y="14" width="6" height="6" rx="1" />
      <rect x="9" y="14" width="6" height="6" rx="1" />
      <rect x="16" y="14" width="6" height="6" rx="1" />
      <rect x="5.5" y="7" width="6" height="6" rx="1" />
      <rect x="12.5" y="7" width="6" height="6" rx="1" />
      <rect x="9" y="0.5" width="6" height="6" rx="1" />
    </>
  ),

  // ── PACK REVEALS ─────────────────────────────────────────────────────────────
  pack_logger: (
    // clipboard with lines
    <>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </>
  ),
  prolific_puller: (
    // sunburst / sparkle
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </>
  ),
  box_breaker: (
    // box with lightning bolt inside
    <>
      <path d="M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
      <path d="M4 8l2-4h12l2 4" />
      <path d="M13.5 11l-2 3h3l-2 3" />
    </>
  ),

  // ── TRANSACTIONS ─────────────────────────────────────────────────────────────
  deal_maker: (
    // check in circle (deal done)
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22,4 12,14.01 9,11.01" />
    </>
  ),
  trusted_seller: (
    // shield with star
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polygon points="12,8 13,10.5 16,10.5 13.5,12.5 14.5,15 12,13.5 9.5,15 10.5,12.5 8,10.5 11,10.5" />
    </>
  ),
  trusted_buyer: (
    // thumbs up
    <>
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </>
  ),
  volume_trader: (
    // double chevron right (speed / volume)
    <>
      <polyline points="6,17 11,12 6,7" />
      <polyline points="13,17 18,12 13,7" />
    </>
  ),
  deal_bundler: (
    // gift / bundle
    <>
      <path d="M20 12v10H4V12" />
      <path d="M22 7H2v5h20V7z" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </>
  ),
  negotiator: (
    // balance scales
    <>
      <line x1="12" y1="3" x2="12" y2="21" />
      <path d="M5 21h14" />
      <polyline points="4,7 12,4 20,7" />
      <circle cx="4" cy="14" r="3" />
      <circle cx="20" cy="14" r="3" />
    </>
  ),

  // ── MARKETPLACE ──────────────────────────────────────────────────────────────
  market_maker: (
    // shopping bag (full market presence)
    <>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  dual_lister: (
    // bidirectional arrows
    <>
      <polyline points="17,1 21,5 17,9" />
      <line x1="3" y1="5" x2="21" y2="5" />
      <polyline points="7,23 3,19 7,15" />
      <line x1="21" y1="19" x2="3" y2="19" />
    </>
  ),

  // ── WATCHLIST ────────────────────────────────────────────────────────────────
  deal_watcher: (
    // eye
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),

  // ── WISHLIST ─────────────────────────────────────────────────────────────────
  wishlist_curator: (
    // heart (wishlist = desired cards)
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  ),
  deal_hunter: (
    // bullseye target (price alert = aiming for a deal)
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  serious_hunter: (
    // crosshair on target (serious = precision aim)
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="8" />
      <line x1="22" y1="12" x2="16" y2="12" />
      <line x1="12" y1="22" x2="12" y2="16" />
      <line x1="2" y1="12" x2="8" y2="12" />
    </>
  ),

  // ── SOCIAL: FOLLOWERS ────────────────────────────────────────────────────────
  connected: (
    // two nodes connected by a line
    <>
      <circle cx="6" cy="12" r="4" />
      <circle cx="18" cy="12" r="4" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </>
  ),
  popular: (
    // three people / crowd
    <>
      <circle cx="8" cy="7" r="3" />
      <circle cx="16" cy="7" r="3" />
      <circle cx="12" cy="5" r="3" />
      <path d="M5 21v-2a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2" />
    </>
  ),
  influencer: (
    // megaphone with broadcast waves
    <>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </>
  ),

  // ── SOCIAL: FOLLOWING ────────────────────────────────────────────────────────
  connector: (
    // network triangle (hub + spokes)
    <>
      <circle cx="12" cy="5" r="2" />
      <circle cx="4" cy="19" r="2" />
      <circle cx="20" cy="19" r="2" />
      <line x1="12" y1="7" x2="4" y2="17" />
      <line x1="12" y1="7" x2="20" y2="17" />
      <line x1="6" y1="19" x2="18" y2="19" />
    </>
  ),
  mutual_collector: (
    // two interlocked circles (mutual connection)
    <>
      <circle cx="8" cy="12" r="6" />
      <circle cx="16" cy="12" r="6" />
    </>
  ),

  // ── MESSAGES ─────────────────────────────────────────────────────────────────
  conversationalist: (
    // speech bubble
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  ),
  community_voice: (
    // microphone (speaking up, distinct from influencer's broadcast megaphone)
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </>
  ),

  // ── PROFILE ──────────────────────────────────────────────────────────────────
  specialist: (
    // graduation cap
    <>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </>
  ),
  complete_profile: (
    // person with checkmark
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <polyline points="16,21 18,23 22,19" />
    </>
  ),

  // ── REVIEWS ──────────────────────────────────────────────────────────────────
  reviewer: (
    // open book with star on page
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <polygon points="12,7 13,9.5 16,9.5 13.5,11.5 14.5,14 12,12.5 9.5,14 10.5,11.5 8,9.5 11,9.5" />
    </>
  ),

  // ── ROI & ANALYTICS ──────────────────────────────────────────────────────────
  roi_positive: (
    // trending up arrow
    <>
      <polyline points="23,6 13.5,15.5 8.5,10.5 1,18" />
      <polyline points="17,6 23,6 23,12" />
    </>
  ),
  price_historian: (
    // calendar with chart line inside
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <polyline points="7,14 9,16 13,13 16,15" />
    </>
  ),

  // ── LONGEVITY ────────────────────────────────────────────────────────────────
  founding_collector: (
    // flag
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>
  ),
  veteran: (
    // medal: circle with ribbon tails
    <>
      <circle cx="12" cy="8" r="6" />
      <line x1="9.5" y1="13" x2="7" y2="22" />
      <line x1="14.5" y1="13" x2="17" y2="22" />
      <line x1="7" y1="22" x2="17" y2="22" />
    </>
  ),

  // ── MULTI-FORMAT ─────────────────────────────────────────────────────────────
  multi_format: (
    // 2×2 grid tiles
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),

  // ── SET COMPLETION ───────────────────────────────────────────────────────────
  set_finisher: (
    // filled binder grid (a completed page of cards) with a check
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </>
  ),
  master_setter: (
    // crown atop a star — mastery of a full set
    <>
      <polygon points="12,2 14,7 19,7 15,10.5 16.5,15.5 12,12.5 7.5,15.5 9,10.5 5,7 10,7" />
      <path d="M4 20h16" />
      <path d="M6 20v-3l3 1.5L12 15l3 3.5 3-1.5v3" />
    </>
  ),
};

export function BadgeChip({
  badge,
  earned = true,
  earnedAt,
  size = "normal",
}: {
  badge: BadgeMeta;
  earned?: boolean;
  earnedAt?: string;
  size?: "normal" | "mini";
}) {
  const c = earned ? SVG_COLORS[badge.color] : LOCKED;

  if (size === "mini") {
    return (
      <svg
        width="32"
        height="36"
        viewBox="-2 -2 56 64"
        aria-hidden="true"
        className={!earned ? "opacity-20" : ""}
      >
        {earned && <polygon points={HEX_POINTS} fill={c.glow} />}
        <polygon points={HEX_POINTS} fill={c.bg} stroke={c.ring} strokeWidth="2" />
        <g
          transform="translate(16,20) scale(0.833)"
          fill="none"
          stroke={c.icon}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {BADGE_ICONS[badge.slug]}
        </g>
      </svg>
    );
  }

  return (
    <div className="group relative flex flex-col items-center gap-1.5 w-[60px]">
      {/* Tooltip */}
      <div
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-surface-raised px-3 py-2 text-center shadow-xl opacity-0 transition-opacity group-hover:opacity-100"
        role="tooltip"
      >
        <p className="text-xs font-semibold text-foreground">{badge.label}</p>
        <p className="mt-0.5 text-[10px] text-foreground-muted">{badge.description}</p>
        {earned && earnedAt && (
          <p className="mt-0.5 text-[10px] text-foreground-muted opacity-70">
            Earned {timeAgo(earnedAt)}
          </p>
        )}
        {!earned && (
          <p className="mt-0.5 text-[10px] text-foreground-muted opacity-60">Not yet earned</p>
        )}
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
      </div>

      {/* Hexagonal badge */}
      <svg
        width="56"
        height="64"
        viewBox="-2 -2 56 64"
        aria-hidden="true"
        className={`transition-transform group-hover:scale-110 ${!earned ? "opacity-30" : ""}`}
      >
        {/* Glow behind hex (earned only) */}
        {earned && (
          <polygon points={HEX_POINTS} fill={c.glow} className="blur-[3px]" />
        )}
        {/* Hex body */}
        <polygon
          points={HEX_POINTS}
          fill={c.bg}
          stroke={c.ring}
          strokeWidth="2"
        />
        {/* Icon centered at (26, 30), scaled from 24×24 to ~20×20 */}
        <g
          transform="translate(16,20) scale(0.833)"
          fill="none"
          stroke={c.icon}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {BADGE_ICONS[badge.slug]}
        </g>
        {/* Lock overlay for unearned */}
        {!earned && (
          <g>
            <circle cx="39" cy="46" r="8" fill="#0c1020" stroke="#1e2440" strokeWidth="1" />
            <rect x="35.5" y="44.5" width="7" height="5" rx="1" fill="#1e2440" />
            <path
              d="M36.8 44.5V43a2.2 2.2 0 014.4 0v1.5"
              fill="none"
              stroke="#2a3860"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>

      {/* Label */}
      <span
        className={`text-center text-[10px] font-medium leading-tight ${
          earned ? "text-foreground" : "text-foreground-muted opacity-40"
        }`}
      >
        {badge.label}
      </span>
    </div>
  );
}
