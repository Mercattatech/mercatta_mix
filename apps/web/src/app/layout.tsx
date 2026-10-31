import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: { default: "Mercatta Mix — do vídeo bruto ao Reel pronto", template: "%s · Mercatta Mix" },
  description: "Grave poucos vídeos e gere dezenas de Reels combinados, legendados e prontos para postar. Um produto do Grupo Mercatta.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${outfit.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
