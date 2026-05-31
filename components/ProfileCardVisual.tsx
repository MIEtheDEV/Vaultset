"use client";

import QRCode from "react-qr-code";
import { resolveAvatarHex } from "@/lib/avatarColors";

export interface ProfileCardData {
  username: string;
  isSupporter: boolean;
  specialty: string | null;
  bio: string | null;
  totalCards: number;
  activeListings: number;
  gradedCount: number;
  joinedAgo: string;
  serialNumber: number;
  featuredImageUrl: string | null;
  avatarUrl: string | null;
  avatarColorKey: string | null;
  listingThumbs: string[];
  profileUrl: string;
}

export type CardTheme = "vault" | "holo" | "print";

const THEMES = {
  vault: {
    card:        { background: "#0f0f0f", color: "#e5e5e5" },
    accent:      "#d4a72c",
    muted:       "#9ca3af",
    border:      "rgba(212,167,44,0.2)",
    divider:     "rgba(212,167,44,0.12)",
    artBg:       "#1a1a1a",
    footerBg:    "#0c0c0c",
    badgeBg:     "rgba(212,167,44,0.10)",
    badgeBorder: "rgba(212,167,44,0.28)",
    qrFg:        "#d4a72c",
    qrBg:        "#0f0f0f",
    valueText:   "#f5f5f5",
    labelText:   "#9ca3af",
  },
  holo: {
    card:        { background: "#0c1a2e", color: "#e0f2fe" },
    accent:      "#38bdf8",
    muted:       "#7dd3fc",
    border:      "rgba(56,189,248,0.2)",
    divider:     "rgba(56,189,248,0.12)",
    artBg:       "#0a1628",
    footerBg:    "#070e1c",
    badgeBg:     "rgba(56,189,248,0.10)",
    badgeBorder: "rgba(56,189,248,0.28)",
    qrFg:        "#38bdf8",
    qrBg:        "#0c1a2e",
    valueText:   "#e0f2fe",
    labelText:   "#7dd3fc",
  },
  print: {
    card:        { background: "#ffffff", color: "#111827" },
    accent:      "#111827",
    muted:       "#6b7280",
    border:      "#e5e7eb",
    divider:     "#e5e7eb",
    artBg:       "#f3f4f6",
    footerBg:    "#f9fafb",
    badgeBg:     "#f3f4f6",
    badgeBorder: "#d1d5db",
    qrFg:        "#111827",
    qrBg:        "#ffffff",
    valueText:   "#111827",
    labelText:   "#6b7280",
  },
};

export function ProfileCardVisual({
  data,
  cta,
  theme,
  cardRef,
}: {
  data: ProfileCardData;
  cta: string;
  theme: CardTheme;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t       = THEMES[theme];
  const color   = resolveAvatarHex(data.avatarColorKey, data.username);
  const initial = data.username.charAt(0).toUpperCase();
  const serial  = `#${String(data.serialNumber).padStart(4, "0")}`;

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
      {/* Header */}
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
          COLLECTOR {serial}
        </span>
      </div>

      {/* Art area */}
      <div
        style={{
          position: "relative",
          height: 178,
          background: t.artBg,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {data.featuredImageUrl && (
          <img
            src={data.featuredImageUrl}
            crossOrigin="anonymous"
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "blur(18px) saturate(1.5) brightness(0.35)",
              transform: "scale(1.12)",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {data.featuredImageUrl ? (
            <img
              src={data.featuredImageUrl}
              crossOrigin="anonymous"
              alt="Featured card"
              style={{
                height: 154,
                objectFit: "contain",
                borderRadius: 8,
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
            />
          ) : data.avatarUrl ? (
            <img
              src={data.avatarUrl}
              crossOrigin="anonymous"
              alt={data.username}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                objectFit: "cover",
                border: `3px solid ${color}88`,
                boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
              }}
            />
          ) : (
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: color + "22",
                border: `2px solid ${color}66`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                fontWeight: 700,
                color,
              }}
            >
              {initial}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          padding: "12px 16px 8px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: t.valueText }}>
            @{data.username}
          </span>
          {data.isSupporter && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: t.accent,
                background: t.badgeBg,
                border: `1px solid ${t.badgeBorder}`,
                borderRadius: 999,
                padding: "2px 6px",
              }}
            >
              SUPPORTER
            </span>
          )}
        </div>

        {data.specialty && (
          <span
            style={{
              fontSize: 10,
              color: t.muted,
              background: t.badgeBg,
              border: `1px solid ${t.badgeBorder}`,
              borderRadius: 999,
              padding: "2px 8px",
              alignSelf: "flex-start",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {data.specialty}
          </span>
        )}

        {data.bio && (
          <p
            style={{
              fontSize: 11,
              color: t.muted,
              lineHeight: 1.45,
              margin: 0,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
            } as React.CSSProperties}
          >
            {data.bio}
          </p>
        )}

        {/* Stats strip */}
        <div style={{ display: "flex", gap: 4, marginTop: "auto", paddingTop: 6 }}>
          {[
            { label: "Cards",    value: data.totalCards     },
            { label: "Listings", value: data.activeListings },
            { label: "Graded",   value: data.gradedCount    },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: t.badgeBg,
                border: `1px solid ${t.badgeBorder}`,
                borderRadius: 8,
                padding: "7px 4px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700, color: t.accent, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 9, color: t.labelText, letterSpacing: "0.05em", textTransform: "uppercase", marginTop: 3 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: t.divider, margin: "0 16px", flexShrink: 0 }} />

      {/* Footer */}
      <div
        style={{
          background: t.footerBg,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            background: t.qrBg,
            padding: 3,
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            flexShrink: 0,
            lineHeight: 0,
          }}
        >
          <QRCode value={data.profileUrl} size={62} fgColor={t.qrFg} bgColor={t.qrBg} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 11,
              color: t.valueText,
              fontWeight: 600,
              margin: "0 0 3px",
              lineHeight: 1.35,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
            } as React.CSSProperties}
          >
            {cta}
          </p>
          <p style={{ fontSize: 10, color: t.muted, margin: 0 }}>vaultset.app</p>
        </div>

        {data.listingThumbs.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {data.listingThumbs.slice(0, 3).map((src, i) => (
              <img
                key={i}
                src={src}
                crossOrigin="anonymous"
                alt=""
                style={{
                  width: 30,
                  height: 42,
                  objectFit: "contain",
                  borderRadius: 4,
                  background: t.artBg,
                }}
              />
            ))}
          </div>
        )}
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
          background: "conic-gradient(from 180deg at 50% 50%, #ff0080 0deg, #ff8c00 50deg, #ffd700 90deg, #00ff88 140deg, #00ccff 180deg, #8b5cf6 230deg, #ff0080 360deg)",
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
