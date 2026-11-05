import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger"; size?: "sm" | "md" | "lg" };

/** Botão no estilo shadcn: variantes e tamanhos, com foco visível e estado de carregamento por `aria-busy`. */
export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "btn-glow text-white",
        variant === "outline" && "border border-border bg-surface text-fg transition hover:bg-surface-2",
        variant === "ghost" && "text-muted transition hover:bg-surface-2 hover:text-fg",
        variant === "danger" && "border border-danger/40 bg-danger/10 text-danger transition hover:bg-danger/20",
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("glass p-5", className)} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface text-fg placeholder:text-muted/70 transition focus:border-primary/70 focus:outline-none",
        className,
      )}
    />
  );
}

const TONES = {
  neutral: "bg-surface-2 text-muted border border-border",
  primary: "bg-primary/20 text-primary-2",
  success: "bg-success/15 text-success",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
} as const;

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONES }) {
  return <span {...props} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)} />;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2 border border-border", className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary", className)} />;
}

export function Alert({ tone = "danger", className, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: "danger" | "warn" | "success" | "primary" }) {
  const t = {
    danger: "border-danger/30 bg-danger/10 text-danger",
    warn: "border-warn/30 bg-warn/10 text-warn",
    success: "border-success/30 bg-success/10 text-success",
    primary: "border-primary/30 bg-primary/10 text-primary-2",
  }[tone];
  return <div role={tone === "danger" ? "alert" : "status"} {...props} className={cn("rounded-xl border px-4 py-3 text-sm", t, className)} />;
}
