import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0d0d0d",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 700,
            height: 350,
            background:
              "radial-gradient(ellipse, rgba(232,184,75,0.18) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            fontSize: 88,
            fontWeight: 700,
            color: "#e8b84b",
            letterSpacing: "0.15em",
            marginBottom: 16,
          }}
        >
          VAULTSET
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#9ca3af",
            textAlign: "center",
            maxWidth: 700,
            lineHeight: 1.5,
          }}
        >
          The all-in-one platform for trading card collectors
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 52 }}>
          {["Smart Inventory", "Live Market Data", "Safe Marketplace"].map(
            (text) => (
              <div
                key={text}
                style={{
                  background: "rgba(232,184,75,0.08)",
                  border: "1px solid rgba(232,184,75,0.25)",
                  borderRadius: 32,
                  padding: "10px 24px",
                  color: "#e8b84b",
                  fontSize: 20,
                }}
              >
                {text}
              </div>
            )
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
