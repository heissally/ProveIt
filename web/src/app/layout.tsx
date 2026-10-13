import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import { SafeAnalytics } from "../components/analytics";
import "./globals.css";

const heading = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-space-grotesk" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "ProveIt",
  description: "Check that a stranger really works at a company or holds a role in a Discord server. Checked inside a Lit Action; nobody can fake the result.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <SafeAnalytics />
      </body>
    </html>
  );
}
