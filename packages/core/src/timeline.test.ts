import { describe, expect, it } from "vitest";
import { buildTimeline, TimelineError, type TimelineInputPiece } from "./timeline";

const piece = (over: Partial<TimelineInputPiece> & Pick<TimelineInputPiece, "segmentId" | "srcStartMs" | "srcEndMs">): TimelineInputPiece => ({
  sourceVideoId: "v-" + over.segmentId,
  type: "hook",
  words: [],
  ...over,
});

describe("buildTimeline", () => {
  it("quantiza em quadros inteiros e áudio com 1600 amostras por quadro", () => {
    const t = buildTimeline([piece({ segmentId: "h1", srcStartMs: 1000, srcEndMs: 4000 })]);
    const p = t.pieces[0]!;
    expect(p.srcStartFrame).toBe(30);
    expect(p.frames).toBe(90);
    expect(p.srcStartSample).toBe(30 * 1600);
    expect(p.srcEndSample - p.srcStartSample).toBe(90 * 1600);
    expect(t.totalDurationMs).toBe(3000);
  });

  it("vídeo e áudio de cada trecho têm exatamente a mesma duração (sem defasagem acumulada)", () => {
    const t = buildTimeline([
      piece({ segmentId: "h1", srcStartMs: 1003, srcEndMs: 4017 }),
      piece({ segmentId: "m1", srcStartMs: 777, srcEndMs: 20333, type: "body" }),
      piece({ segmentId: "c1", srcStartMs: 50, srcEndMs: 6999, type: "cta" }),
    ]);
    for (const p of t.pieces) {
      const videoSec = p.frames / t.fps;
      const audioSec = (p.srcEndSample - p.srcStartSample) / t.sampleRate;
      expect(audioSec).toBeCloseTo(videoSec, 12);
    }
    const sumFrames = t.pieces.reduce((s, p) => s + p.frames, 0);
    expect(t.totalFrames).toBe(sumFrames);
  });

  it("posiciona os trechos em sequência na saída", () => {
    const t = buildTimeline([
      piece({ segmentId: "h1", srcStartMs: 0, srcEndMs: 2000 }),
      piece({ segmentId: "m1", srcStartMs: 5000, srcEndMs: 10000, type: "body" }),
    ]);
    expect(t.pieces[0]!.outStartMs).toBe(0);
    expect(t.pieces[1]!.outStartFrame).toBe(60);
    expect(t.pieces[1]!.outStartMs).toBe(2000);
    expect(t.pieces[1]!.outEndMs).toBe(7000);
  });

  it("remapeia as palavras para a linha do tempo de saída", () => {
    const t = buildTimeline([
      piece({
        segmentId: "h1",
        srcStartMs: 1000,
        srcEndMs: 3000,
        words: [
          { w: "Oi", start_ms: 1100, end_ms: 1400 },
          { w: "gente", start_ms: 1500, end_ms: 2000 },
        ],
      }),
      piece({
        segmentId: "m1",
        type: "body",
        srcStartMs: 10000,
        srcEndMs: 12000,
        words: [{ w: "hoje", start_ms: 10200, end_ms: 10700 }],
      }),
    ]);
    expect(t.captionWords).toEqual([
      { text: "Oi", startMs: 100, endMs: 400 },
      { text: "gente", startMs: 500, endMs: 1000 },
      { text: "hoje", startMs: 2200, endMs: 2700 }, // 2000 (início do 2º trecho) + 200
    ]);
  });

  it("erro de legenda após as emendas é menor que 150 ms mesmo com cortes fora da grade de quadros", () => {
    const srcStartMs = 1013; // não cai em quadro exato (33,33 ms/quadro)
    const word = { w: "teste", start_ms: 1500, end_ms: 1900 };
    const t = buildTimeline([piece({ segmentId: "h1", srcStartMs, srcEndMs: 3000, words: [word] })]);
    const expectedMs = word.start_ms - srcStartMs; // onde "deveria" cair
    const actualMs = t.captionWords[0]!.startMs;
    expect(Math.abs(actualMs - expectedMs)).toBeLessThan(34);
  });

  it("descarta palavras fora do corte e recorta as que passam da borda", () => {
    const t = buildTimeline([
      piece({
        segmentId: "h1",
        srcStartMs: 1000,
        srcEndMs: 2000,
        words: [
          { w: "antes", start_ms: 500, end_ms: 900 },
          { w: "borda", start_ms: 1900, end_ms: 2300 },
        ],
      }),
    ]);
    expect(t.captionWords).toHaveLength(1);
    expect(t.captionWords[0]!.endMs).toBe(1000);
  });

  it("trecho minúsculo ainda ocupa ao menos 1 quadro", () => {
    const t = buildTimeline([piece({ segmentId: "h1", srcStartMs: 1000, srcEndMs: 1001 })]);
    expect(t.pieces[0]!.frames).toBe(1);
  });

  it("rejeita corte inválido ou lista vazia", () => {
    expect(() => buildTimeline([])).toThrow(TimelineError);
    expect(() => buildTimeline([piece({ segmentId: "x", srcStartMs: 2000, srcEndMs: 1000 })])).toThrow(TimelineError);
    expect(() => buildTimeline([piece({ segmentId: "x", srcStartMs: -5, srcEndMs: 1000 })])).toThrow(TimelineError);
  });
});
