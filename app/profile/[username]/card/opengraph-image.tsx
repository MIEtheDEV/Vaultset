import { ImageResponse } from "next/og";

export const runtime     = "edge";
export const alt         = "Vaultset Collector Card";
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { username: string } }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0f0f",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "#d4a72c",
            letterSpacing: "0.14em",
            marginBottom: 20,
          }}
        >
          VAULTSET
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, color: "#ffffff" }}>
          @{params.username}
        </div>
        <div style={{ fontSize: 22, color: "#9ca3af", marginTop: 14 }}>
          Collector Card
        </div>
        <div
          style={{
            marginTop: 36,
            padding: "10px 28px",
            background: "rgba(212,167,44,0.12)",
            border: "1px solid rgba(212,167,44,0.3)",
            borderRadius: 999,
            fontSize: 18,
            color: "#d4a72c",
          }}
        >
          vaultset.app
        </div>
      </div>
    ),
    { ...size }
  );
}
