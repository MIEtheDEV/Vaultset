import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
  },
  title: "Vaultset — The Ultimate Trading Card Platform",
  description:
    "Manage your collection, track live market values, buy and sell cards, and connect with a passionate community. Vaultset is the all-in-one platform for trading card collectors.",
  keywords: [
    "trading cards",
    "TCG",
    "card collection",
    "Pokemon cards",
    "MTG",
    "buy sell trade cards",
    "card market",
    "card inventory",
  ],
  openGraph: {
    title: "Vaultset — The Ultimate Trading Card Platform",
    description:
      "Manage your collection, track live market values, buy and sell cards, and connect with a passionate community.",
    type: "website",
    siteName: "Vaultset",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vaultset — The Ultimate Trading Card Platform",
    description:
      "Manage your collection, track live market values, buy and sell cards, and connect with a passionate community.",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
