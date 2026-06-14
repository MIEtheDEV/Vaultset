import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Footer } from "@/components/Footer";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://vaultset.app"),
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
  },
  title: {
    default: "Vaultset — The Ultimate Trading Card Platform",
    template: "%s — Vaultset",
  },
  description:
    "Manage your collection, track live market values, buy and sell cards, and connect with a passionate community. Vaultset is the all-in-one platform for trading card collectors.",
  keywords: [
    "trading cards", "TCG", "card collection", "Pokemon cards", "MTG",
    "buy sell trade cards", "card market", "card inventory", "Pokemon TCG marketplace",
    "trading card collector platform",
  ],
  alternates: { canonical: "https://vaultset.app" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title: "Vaultset — The Ultimate Trading Card Platform",
    description:
      "Manage your collection, track live market values, buy and sell cards, and connect with a passionate community.",
    url: "https://vaultset.app",
    type: "website",
    siteName: "Vaultset",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Vaultset — The Ultimate Trading Card Platform" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@vaultsetapp",
    title: "Vaultset — The Ultimate Trading Card Platform",
    description:
      "Manage your collection, track live market values, buy and sell cards, and connect with a passionate community.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Footer />
        <ServiceWorkerRegistrar />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
