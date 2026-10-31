import type { Combination } from "./combinations";

export interface DurationViolation {
  code: string;
  network: string;
  totalMs: number;
  limitMs: number;
  overByMs: number;
}

/** Quais combinações passam do limite de duração de cada rede de destino. */
export function findDurationViolations(combos: Combination[], limitsMsByNetwork: Record<string, number>): DurationViolation[] {
  const out: DurationViolation[] = [];
  for (const [network, limitMs] of Object.entries(limitsMsByNetwork)) {
    for (const c of combos) {
      if (c.totalDurationMs > limitMs) {
        out.push({ code: c.code, network, totalMs: c.totalDurationMs, limitMs, overByMs: c.totalDurationMs - limitMs });
      }
    }
  }
  return out;
}

export interface UploadRules {
  maxDurationMs: number;
  maxBytes: number;
  extensions: string[];
}

export const COMBINER_UPLOAD_RULES: UploadRules = {
  maxDurationMs: 3 * 60 * 1000,
  maxBytes: 5 * 1024 ** 3,
  extensions: ["mp4", "mov", "mkv"],
};

export type UploadIssue = "extension" | "size" | "duration";

/** Validação dos arquivos do Combinador (formato, tamanho e duração de até 3 min). */
export function validateUpload(file: { name: string; sizeBytes: number; durationMs?: number }, rules: UploadRules = COMBINER_UPLOAD_RULES): UploadIssue[] {
  const issues: UploadIssue[] = [];
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!rules.extensions.includes(ext)) issues.push("extension");
  if (file.sizeBytes > rules.maxBytes) issues.push("size");
  if (file.durationMs !== undefined && file.durationMs > rules.maxDurationMs) issues.push("duration");
  return issues;
}

export interface CreditCosts {
  perRender: number;
  perTranscribedMinute?: number;
}

/** Custo em créditos mostrado ANTES de renderizar. */
export function estimateCredits(renders: number, costs: CreditCosts): number {
  if (!Number.isInteger(renders) || renders < 0) throw new Error("Quantidade de renders inválida");
  return renders * costs.perRender;
}
