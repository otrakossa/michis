import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "michis",
  description: "Investigación y denuncia coordinada de bots",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
