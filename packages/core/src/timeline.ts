import type { CaptionWord, SegmentType, Word } from "./types";

export const VIDEO_FPS = 30;
export const AUDIO_SAMPLE_RATE = 48000;

export interface TimelineInputPiece {
  segmentId: string;
  sourceVideoId: string;
  type: SegmentType;
  /** Corte em ms no vídeo de origem (já com margens). */
  srcStartMs: number;
  srcEndMs: number;
  /** Palavras que pertencem a este trecho (tempo no vídeo de origem). */
  words: Word[];
}

export interface TimelinePiece {
  segmentId: string;
  sourceVideoId: string;
  type: SegmentType;
  /** Quadro inicial no vídeo de origem e quantidade de quadros. */
  srcStartFrame: number;
  frames: number;
  /** Amostras de áudio correspondentes (exatas: frames × samplesPerFrame). */
  srcStartSample: number;
  srcEndSample: number;
  /** Posição na linha do tempo de saída. */
  outStartFrame: number;
  outStartMs: number;
  outEndMs: number;
}

export interface Timeline {
  fps: number;
  sampleRate: number;
  pieces: TimelinePiece[];
  totalFrames: number;
  totalDurationMs: number;
  captionWords: CaptionWord[];
}

export class TimelineError extends Error {}

/**
 * Monta a linha do tempo do vídeo final.
 *
 * Todo corte é quantizado em QUADROS INTEIROS (30 fps). Com 48 kHz, cada quadro tem
 * exatamente 1600 amostras de áudio, então vídeo e áudio de cada trecho têm a MESMA
 * duração e a emenda não acumula defasagem.
 */
export function buildTimeline(pieces: TimelineInputPiece[], opts: { fps?: number; sampleRate?: number } = {}): Timeline {
  const fps = opts.fps ?? VIDEO_FPS;
  const sampleRate = opts.sampleRate ?? AUDIO_SAMPLE_RATE;
  const samplesPerFrame = sampleRate / fps;
  if (!Number.isInteger(samplesPerFrame)) throw new TimelineError("sampleRate/fps precisa ser inteiro para emendas exatas");
  if (pieces.length === 0) throw new TimelineError("Nenhum trecho na linha do tempo");

  const out: TimelinePiece[] = [];
  const captionWords: CaptionWord[] = [];
  let outFrame = 0;

  for (const p of pieces) {
    if (!(p.srcEndMs > p.srcStartMs) || p.srcStartMs < 0) throw new TimelineError(`Trecho ${p.segmentId} com corte inválido`);
    const srcStartFrame = Math.round((p.srcStartMs * fps) / 1000);
    const srcEndFrame = Math.round((p.srcEndMs * fps) / 1000);
    const frames = Math.max(1, srcEndFrame - srcStartFrame);

    const outStartMs = (outFrame * 1000) / fps;
    const outEndMs = ((outFrame + frames) * 1000) / fps;
    const srcStartFrameMs = (srcStartFrame * 1000) / fps;

    for (const word of p.words) {
      const start = word.start_ms - srcStartFrameMs + outStartMs;
      const end = word.end_ms - srcStartFrameMs + outStartMs;
      const cs = Math.max(start, outStartMs);
      const ce = Math.min(end, outEndMs);
      if (ce - cs <= 0) continue; // palavra fora do corte
      captionWords.push({ text: word.w, startMs: cs, endMs: ce });
    }

    out.push({
      segmentId: p.segmentId,
      sourceVideoId: p.sourceVideoId,
      type: p.type,
      srcStartFrame,
      frames,
      srcStartSample: srcStartFrame * samplesPerFrame,
      srcEndSample: (srcStartFrame + frames) * samplesPerFrame,
      outStartFrame: outFrame,
      outStartMs,
      outEndMs,
    });
    outFrame += frames;
  }

  return {
    fps,
    sampleRate,
    pieces: out,
    totalFrames: outFrame,
    totalDurationMs: (outFrame * 1000) / fps,
    captionWords,
  };
}
