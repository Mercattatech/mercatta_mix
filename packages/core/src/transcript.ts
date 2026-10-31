import type { Word } from "./types";

export interface RawWord {
  w: string;
  start_ms: number;
  end_ms: number;
  conf?: number;
}

/**
 * Limpa a saída de um transcritor: remove palavras vazias, ordena, garante fim > início
 * e corrige sobreposições pequenas (o Whisper às vezes devolve palavras que se cruzam).
 */
export function normalizeWords(raw: RawWord[]): Word[] {
  const cleaned = raw
    .map((r) => ({ ...r, w: r.w.trim() }))
    .filter((r) => r.w.length > 0 && Number.isFinite(r.start_ms) && Number.isFinite(r.end_ms))
    .map((r) => ({ ...r, start_ms: Math.max(0, Math.round(r.start_ms)), end_ms: Math.max(0, Math.round(r.end_ms)) }))
    .sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);

  const out: Word[] = [];
  for (const r of cleaned) {
    const prev = out[out.length - 1];
    let start = r.start_ms;
    if (prev && start < prev.end_ms) {
      // sobreposição: encurta a anterior até o início desta (mínimo de 10 ms); se não der, empurra esta para frente
      prev.end_ms = Math.max(prev.start_ms + 10, start);
      start = Math.max(start, prev.end_ms);
    }
    const end = Math.max(r.end_ms, start + 10);
    out.push({ w: r.w, start_ms: start, end_ms: end, ...(r.conf !== undefined ? { conf: r.conf } : {}) });
  }
  return out;
}
