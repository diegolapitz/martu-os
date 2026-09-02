import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import "./v1-surfaces.css";
import "./studio-dispatch.css";
import "./direction-3a.css";

const schibsted = Schibsted_Grotesk({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-schibsted",
  weight: "variable",
});

const plexMono = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "Martu OS", template: "%s · Martu OS" },
  description: "Tu supervisora y todo el mundo de cada cliente, en un solo lugar.",
  applicationName: "Martu OS",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eef0ed",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${schibsted.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
