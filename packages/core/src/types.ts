/** Tipos de domínio compartilhados. Formatos persistidos (jsonb) usam snake_case. */

export type SegmentType = "hook" | "body" | "cta" | "extra";

export const SEGMENT_TYPES: readonly SegmentType[] = ["hook", "body", "cta", "extra"] as const;

/** Palavra transcrita com tempo em ms (tabela transcripts.words). */
export interface Word {
  w: string;
  start_ms: number;
  end_ms: number;
  conf?: number;
}

/** Palavra já posicionada na linha do tempo do vídeo final (ms, fracionário). */
export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}
