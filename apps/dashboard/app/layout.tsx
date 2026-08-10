import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Tolerate a malformed NEXTAUTH_URL (e.g. missing protocol) instead of throwing at
// module scope -- a bad env var here would fail the whole `next build` during page-data
// collection, which is a far worse failure mode than a wrong metadataBase.
function siteUrl(): URL {
  const raw = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(`https://${raw}`);
    } catch {
      return new URL("http://localhost:3000");
    }
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "CMS", template: "%s" },
  description: "Church management: people, groups, events, forms, and workflows.",
  openGraph: {
    siteName: "CMS",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#b87b38",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
