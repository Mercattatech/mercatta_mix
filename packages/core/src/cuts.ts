import type { Word } from "./types";

export interface EnergyEnvelope {
  /** Passo entre amostras, em ms. values[i] = energia (RMS) no instante i * stepMs. */
  stepMs: number;
  values: number[];
}

export interface CutOptions {
  /** Margem antes da primeira palavra. Padrão: 100 ms. */
  padBeforeMs?: number;
  /** Margem depois da última palavra. Padrão: 150 ms. */
  padAfterMs?: number;
  /** Janela de busca do ponto mais silencioso (±). Padrão: 30 ms. */
  snapWindowMs?: number;
  /** Envelope de energia do áudio; sem ele, não há ajuste fino. */
  envelope?: EnergyEnvelope;
}

export interface Cut {
  srcStartMs: number;
  srcEndMs: number;
  /** Primeira e última palavra dentro do corte (para a legenda). */
  firstWordStartMs: number;
  lastWordEndMs: number;
}

export class CutError extends Error {}

export const DEFAULT_PAD_BEFORE_MS = 100;
export const DEFAULT_PAD_AFTER_MS = 150;
export const DEFAULT_SNAP_WINDOW_MS = 30;

/**
 * Calcula o corte de um trecho a partir do intervalo de palavras [startIdx, endIdx].
 *
 * Garantias:
 *  - o corte NUNCA invade a palavra vizinha (fica dentro da pausa entre as palavras);
 *  - a margem é a pedida (100 ms antes, 150 ms depois) quando a pausa permite;
 *    com pausas curtas, usa no máximo metade da pausa de cada lado;
 *  - o ponto final é ajustado para o instante mais silencioso por perto (evita estalo).
 */
export function computeCut(words: Word[], startIdx: number, endIdx: number, mediaDurationMs: number, options: CutOptions = {}): Cut {
  if (!Number.isInteger(startIdx) || !Number.isInteger(endIdx) || startIdx < 0 || endIdx >= words.length || startIdx > endIdx) {
    throw new CutError(`Intervalo de palavras inválido: ${startIdx}..${endIdx} (total ${words.length})`);
  }
  if (!(mediaDurationMs > 0)) throw new CutError("Duração da mídia inválida");

  const padBefore = options.padBeforeMs ?? DEFAULT_PAD_BEFORE_MS;
  const padAfter = options.padAfterMs ?? DEFAULT_PAD_AFTER_MS;
  const window = options.snapWindowMs ?? DEFAULT_SNAP_WINDOW_MS;

  const first = clamp(words[startIdx]!.start_ms, 0, mediaDurationMs);
  const last = clamp(words[endIdx]!.end_ms, 0, mediaDurationMs);
  if (last <= first) throw new CutError("A palavra final termina antes (ou junto) da inicial");

  const prevEnd = startIdx > 0 ? clamp(words[startIdx - 1]!.end_ms, 0, first) : 0;
  const nextStart = endIdx < words.length - 1 ? clamp(words[endIdx + 1]!.start_ms, last, mediaDurationMs) : mediaDurationMs;

  const gapBefore = first - prevEnd;
  const gapAfter = nextStart - last;

  // Primeira/última palavra do vídeo podem usar toda a margem; as demais, no máximo metade da pausa.
  const maxPadBefore = startIdx === 0 ? gapBefore : Math.floor(gapBefore / 2);
  const maxPadAfter = endIdx === words.length - 1 ? gapAfter : Math.floor(gapAfter / 2);

  let start = first - Math.min(padBefore, maxPadBefore);
  let end = last + Math.min(padAfter, maxPadAfter);

  if (options.envelope) {
    start = snapToQuietPoint(start, options.envelope, window, prevEnd, first);
    end = snapToQuietPoint(end, options.envelope, window, last, nextStart);
  }

  return {
    srcStartMs: Math.round(start),
    srcEndMs: Math.round(end),
    firstWordStartMs: first,
    lastWordEndMs: last,
  };
}

/**
 * Procura o instante de menor energia em [target - window, target + window], limitado a [minMs, maxMs].
 * Em empate, escolhe o mais perto do alvo.
 */
export function snapToQuietPoint(targetMs: number, envelope: EnergyEnvelope, windowMs: number, minMs: number, maxMs: number): number {
  const { stepMs, values } = envelope;
  if (!(stepMs > 0) || values.length === 0) return targetMs;
  const lo = Math.max(targetMs - windowMs, minMs);
  const hi = Math.min(targetMs + windowMs, maxMs);
  if (hi < lo) return clamp(targetMs, minMs, maxMs);

  const iLo = Math.max(0, Math.ceil(lo / stepMs));
  const iHi = Math.min(values.length - 1, Math.floor(hi / stepMs));
  if (iHi < iLo) return clamp(targetMs, lo, hi);

  let bestIdx = -1;
  let bestVal = Infinity;
  let bestDist = Infinity;
  for (let i = iLo; i <= iHi; i++) {
    const v = values[i]!;
    const dist = Math.abs(i * stepMs - targetMs);
    if (v < bestVal || (v === bestVal && dist < bestDist)) {
      bestVal = v;
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx < 0 ? targetMs : bestIdx * stepMs;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
