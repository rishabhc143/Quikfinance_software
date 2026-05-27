import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "Quikfinance", template: "%s · Quikfinance" },
  description: "Production-grade accounting for modern businesses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
       * suppressHydrationWarning on <body>: browser extensions
       * (Grammarly, Microsoft Editor in Edge, password managers,
       * ColorZilla, etc.) inject attributes into <body> before React
       * hydrates — e.g. data-gr-ext-installed, cz-shortcut-listen.
       * Without this, React flags the server/client <body> attribute
       * mismatch as a hydration error (#418) and bails to a full-root
       * client re-render (#423) on every page. Suppressing here only
       * affects the body element's own attributes, not its children.
       */}
      <body
        className={`${inter.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
