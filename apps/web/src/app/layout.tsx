import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: { default: "Mercatta Mix — do vídeo bruto ao Reel pronto", template: "%s · Mercatta Mix" },
  description: "Grave poucos vídeos e gere dezenas de Reels combinados, legendados e prontos para postar. Um produto do Grupo Mercatta.",
};

const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('mm_theme');
      if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} ${outfit.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
