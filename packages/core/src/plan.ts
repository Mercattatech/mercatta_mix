import type { CaptionStyle } from "./ass";
import { DEFAULT_CAPTION_STYLE } from "./ass";
import { planHash } from "./hash";
import { DEFAULT_PAD_AFTER_MS, DEFAULT_PAD_BEFORE_MS, DEFAULT_SNAP_WINDOW_MS } from "./cuts";
import type { SegmentType } from "./types";

/** Muda quando o jeito de renderizar muda (força novos renders em vez de reaproveitar os antigos). */
export const RENDERER_VERSION = 1;

export interface RenderPlanPiece {
  segmentId: string;
  sourceVideoId: string;
  type: SegmentType;
  startWordIdx: number;
  endWordIdx: number;
  /** Hash do arquivo de origem: se o vídeo for trocado, o plano muda. */
  sourceSha256: string;
  /** Fatos da transcrição que definem os cortes. */
  transcriptKey: string;
}

export interface RenderPlan {
  rendererVersion: number;
  pieces: RenderPlanPiece[];
  style: CaptionStyle | null; // null = sem legenda
  fadeMs: number;
  padBeforeMs: number;
  padAfterMs: number;
  snapWindowMs: number;
  output: { width: number; height: number; fps: number; crf: number };
}

export function makeRenderPlan(
  pieces: RenderPlanPiece[],
  opts: { style?: Partial<CaptionStyle> | null; fadeMs?: number } = {},
): RenderPlan {
  return {
    rendererVersion: RENDERER_VERSION,
    pieces,
    style: opts.style === null ? null : { ...DEFAULT_CAPTION_STYLE, ...opts.style },
    fadeMs: opts.fadeMs ?? 50,
    padBeforeMs: DEFAULT_PAD_BEFORE_MS,
    padAfterMs: DEFAULT_PAD_AFTER_MS,
    snapWindowMs: DEFAULT_SNAP_WINDOW_MS,
    output: { width: 1080, height: 1920, fps: 30, crf: 20 },
  };
}

/** Identifica um render: o mesmo plano gera sempre o mesmo vídeo. */
export function renderPlanHash(plan: RenderPlan): string {
  return planHash(plan);
}
