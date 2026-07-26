"use client";

import QRCode from "react-qr-code";
import { BadgeChip } from "@/components/BadgeChip";
import { SHARE_CARD_THEMES, HOLO_EDGE, type CardTheme } from "@/lib/shareCardThemes";
import type { BadgeMeta } from "@/lib/badges";

/**
 * A shareable card for one earned achievement.
 *
 * Sibling to ProfileCardVisual rather than a mode of it: the two show completely
 * different things (a badge and its date versus a collector's stats, bio and
 * listing thumbs), so folding both into one component would mean branching most of
 * its body. They share what actually should be shared — the three theme palettes
 * (lib/shareCardThemes.ts), the 340×500 geometry, and the html-to-image export path.
 *
 * The badge art comes from BadgeChip's "hero" size, so the hex, colour and
 * per-slug icon are the real ones rather than a redrawn approximation.
 *
 * All styling is inline with hardcoded hexes: this gets rasterised to PNG and
 * viewed outside the app, so it must not inherit the viewer's theme or depend on
 * Tailwind being present at paint time.
 */
export type AchievementCardData = {
  username: string;
  badge: BadgeMeta;
  /** Formatted date string, e.g. "26 July 2026". Null when unknown. */
  earnedOn: string | null;
  /** Ordinal among the user's badges — "achievement 7 of 50". */
  index: number;
  totalBadges: number;
  profileUrl: string;
};

export function AchievementCardVisual({
  data,
  theme,
  cardRef,
}: {
  data: AchievementCardData;
  theme: CardTheme;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = SHARE_CARD_THEMES[theme];

  const inner = (
    <div
      ref={theme !== "holo" ? cardRef : undefined}
      style={{
        width: 340,
        height: 500,
        ...t.card,
        borderRadius: 20,
        border: `1px solid ${t.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header — mirrors the profile card so a shared pair reads as one set */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 16px 11px",
          borderBottom: `1px solid ${t.divider}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: t.accent }}>
          VAULTSET
        </span>
        <span style={{ fontSize: 10, color: t.muted, letterSpacing: "0.06em" }}>
          ACHIEVEMENT {data.index} / {data.totalBadges}
        </span>
      </div>

      {/* Badge art */}
      <div
        style={{
          position: "relative",
          height: 200,
          background: t.artBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {/* Soft radial bloom behind the hex, in the badge's own accent */}
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${t.accent}22 0%, transparent 68%)`,
          }}
        />
        <div style={{ position: "relative", lineHeight: 0 }}>
          <BadgeChip badge={data.badge} earned size="hero" />
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          padding: "16px 18px 10px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: t.accent,
            textTransform: "uppercase",
          }}
        >
          Unlocked
        </span>

        <p style={{ fontSize: 21, fontWeight: 700, color: t.valueText, margin: 0, lineHeight: 1.15 }}>
          {data.badge.label}
        </p>

        <p style={{ fontSize: 11.5, color: t.muted, lineHeight: 1.45, margin: 0 }}>
          {data.badge.description}
        </p>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: t.labelText,
              background: t.badgeBg,
              border: `1px solid ${t.badgeBorder}`,
              borderRadius: 999,
              padding: "3px 10px",
              whiteSpace: "nowrap",
            }}
          >
            @{data.username}
          </span>
          {data.earnedOn && (
            <span
              style={{
                fontSize: 10,
                color: t.labelText,
                background: t.badgeBg,
                border: `1px solid ${t.badgeBorder}`,
                borderRadius: 999,
                padding: "3px 10px",
                whiteSpace: "nowrap",
              }}
            >
              {data.earnedOn}
            </span>
          )}
        </div>
      </div>

      {/* Footer with QR back to the profile */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: t.footerBg,
          borderTop: `1px solid ${t.divider}`,
          flexShrink: 0,
        }}
      >
        <div style={{ background: t.qrBg, padding: 3, borderRadius: 5, flexShrink: 0, lineHeight: 0 }}>
          <QRCode
            value={data.profileUrl}
            size={40}
            fgColor={t.qrFg}
            bgColor={t.qrBg}
            style={{ display: "block" }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <p style={{ fontSize: 11, color: t.valueText, fontWeight: 600, margin: "0 0 3px", lineHeight: 1.35 }}>
            Track your collection on Vaultset
          </p>
          <p style={{ fontSize: 10, color: t.muted, margin: 0 }}>vaultset.app</p>
        </div>
      </div>
    </div>
  );

  if (theme === "holo") {
    return (
      <div
        ref={cardRef}
        style={{
          padding: 2,
          borderRadius: 22,
          background: HOLO_EDGE,
          display: "inline-block",
          lineHeight: 0,
        }}
      >
        {inner}
      </div>
    );
  }

  return inner;
}
