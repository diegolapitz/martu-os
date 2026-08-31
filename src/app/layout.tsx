import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./v1-surfaces.css";

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
  themeColor: "#f7f8fb",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
