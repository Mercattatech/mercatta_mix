import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatBytes(n: number): string {
  if (n < 1024 ** 2) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const TYPE_LABELS = { hook: "Gancho", body: "Miolo", cta: "Chamada (CTA)", extra: "Extra" } as const;
export const TYPE_HINTS = {
  hook: "Os primeiros segundos: prende a atenção.",
  body: "O conteúdo: explica, mostra, convence.",
  cta: "O fechamento: diz o que a pessoa deve fazer.",
  extra: "Opcional: depoimento, oferta, bastidor…",
} as const;
export const TYPE_ORDER = ["hook", "body", "cta", "extra"] as const;
export type VideoType = (typeof TYPE_ORDER)[number];
