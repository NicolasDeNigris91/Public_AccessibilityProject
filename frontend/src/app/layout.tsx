import "./globals.css";
import type { ReactNode } from "react";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { ColorBlindFilters } from "@/components/ColorBlindFilters";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata = {
  title: "Euthus — Acessibilidade, vista com clareza",
  description:
    "Ferramenta de auditoria de acessibilidade web que explica, não só aponta. Construída com axe-core.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        <ColorBlindFilters />
        {children}
      </body>
    </html>
  );
}
