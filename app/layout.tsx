import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Footer } from "@/components/Footer";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { PwaInstallTracker } from "@/components/PwaInstallTracker";
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
  metadataBase: new URL("https://www.vaultset.app"),
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
  },
  title: {
    default: "Track, Value & Trade Your Pokémon Card Collection — Vaultset",
    template: "%s — Vaultset",
  },
  description:
    "Free Pokémon TCG collection tracker, card inventory manager & master set tracker. Track your cards, follow live market prices, and buy, sell & trade with collectors.",
  keywords: [
    "pokemon card collection tracker", "pokémon tcg collection tracker", "master set tracker",
    "pokemon master set", "card inventory", "trading card platform", "trading card collection manager",
    "pokemon card portfolio tracker", "tcg collection app", "trading cards", "buy sell trade pokemon cards",
    "pokemon tcg marketplace",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title: "Track, Value & Trade Your Pokémon Card Collection — Vaultset",
    description:
      "Free Pokémon TCG collection tracker, card inventory & master set tracker. Follow live market prices and buy, sell & trade with collectors.",
    url: "https://www.vaultset.app",
    type: "website",
    siteName: "Vaultset",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Vaultset — Pokémon TCG collection tracker, master set tracker & marketplace" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@vaultsetapp",
    title: "Track, Value & Trade Your Pokémon Card Collection — Vaultset",
    description:
      "Free Pokémon TCG collection tracker, card inventory & master set tracker. Follow live market prices and buy, sell & trade with collectors.",
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
        <PwaInstallTracker />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
