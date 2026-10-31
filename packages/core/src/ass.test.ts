import { describe, expect, it } from "vitest";
import { assColor, assTime, buildAss, buildCaptionEvents, groupCaptionChunks, parseAssDialogues } from "./ass";
import type { CaptionWord } from "./types";

const cw = (text: string, startMs: number, endMs: number): CaptionWord => ({ text, startMs, endMs });

describe("assColor / assTime", () => {
  it("converte #RRGGBB para &H00BBGGRR", () => {
    expect(assColor("#FFD400")).toBe("&H0000D4FF");
    expect(assColor("#000000")).toBe("&H00000000");
    expect(() => assColor("amarelo")).toThrow();
  });
  it("formata H:MM:SS.cc", () => {
    expect(assTime(0)).toBe("0:00:00.00");
    expect(assTime(1234)).toBe("0:00:01.23");
    expect(assTime(61_005)).toBe("0:01:01.01");
    expect(assTime(3_600_000)).toBe("1:00:00.00");
  });
});

describe("groupCaptionChunks", () => {
  const style = { maxWordsPerLine: 3, maxCharsPerLine: 22, maxGapMs: 600 };
  it("quebra por quantidade de palavras", () => {
    const words = ["a", "b", "c", "d", "e"].map((t, i) => cw(t, i * 300, i * 300 + 250));
    expect(groupCaptionChunks(words, style).map((c) => c.length)).toEqual([3, 2]);
  });
  it("quebra por pausa longa e por fim de frase", () => {
    const words = [cw("Oi.", 0, 300), cw("Tudo", 350, 600), cw("bem", 2000, 2300)];
    expect(groupCaptionChunks(words, style).map((c) => c.map((w) => w.text))).toEqual([["Oi."], ["Tudo"], ["bem"]]);
  });
  it("quebra por limite de caracteres", () => {
    const words = [cw("paralelepípedo", 0, 300), cw("extraordinário", 350, 700)];
    expect(groupCaptionChunks(words, style)).toHaveLength(2);
  });
  it("ignora palavras vazias", () => {
    expect(groupCaptionChunks([cw("  ", 0, 100), cw("ok", 100, 200)], style)).toHaveLength(1);
  });
});

describe("buildCaptionEvents (karaokê)", () => {
  const words = [cw("Oi", 100, 400), cw("gente", 450, 900), cw("hoje", 950, 1300)];

  it("gera um evento por palavra, começando exatamente quando a palavra começa", () => {
    const events = buildCaptionEvents(words);
    expect(events.map((e) => e.startMs)).toEqual([100, 450, 950]);
  });

  it("eventos são contíguos dentro da linha e a palavra falada vai destacada", () => {
    const events = buildCaptionEvents(words);
    expect(events[0]!.endMs).toBe(events[1]!.startMs);
    expect(events[1]!.endMs).toBe(events[2]!.startMs);
    expect(events[1]!.text).toContain("{\\c&H0000D4FF}GENTE{\\c&H00FFFFFF}");
    expect(events[1]!.text.startsWith("OI ")).toBe(true);
  });

  it("a última palavra fica na tela por holdMs, sem passar do início da próxima linha", () => {
    const e = buildCaptionEvents(words);
    expect(e[2]!.endMs).toBe(1300 + 200);
    const next = buildCaptionEvents([...words, cw("amigos", 1350, 1700)], { maxWordsPerLine: 3 });
    expect(next[2]!.endMs).toBe(1350); // limitado pela próxima linha
  });

  it("modo estático gera um bloco por linha", () => {
    const e = buildCaptionEvents(words, { mode: "static" });
    expect(e).toHaveLength(1);
    expect(e[0]!.text).toBe("OI GENTE HOJE");
  });

  it("caixa alta é opcional", () => {
    expect(buildCaptionEvents(words, { mode: "static", uppercase: false })[0]!.text).toBe("Oi gente hoje");
  });

  it("escapa chaves e barras para não quebrar o ASS", () => {
    const e = buildCaptionEvents([cw("{olá}\\N", 0, 500)], { mode: "static", uppercase: false });
    expect(e[0]!.text).toBe("(olá)N");
  });
});

describe("buildAss", () => {
  const words = [cw("Oi", 100, 400), cw("gente", 450, 900)];

  it("tem as seções obrigatórias e resolução 1080×1920", () => {
    const ass = buildAss(words);
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toContain("[Events]");
    expect(ass).toMatch(/Style: Default,DejaVu Sans,78,/);
  });

  it("posição define o alinhamento", () => {
    expect(buildAss(words, { position: "middle" })).toMatch(/,5,60,60,360,1/);
    expect(buildAss(words, { position: "bottom" })).toMatch(/,2,60,60,360,1/);
  });

  it("os tempos dos Dialogue ficam a até 10 ms do tempo real da palavra (bem abaixo de 150 ms)", () => {
    const ass = buildAss(words);
    const d = parseAssDialogues(ass);
    const starts = d.map((x) => x.startMs);
    expect(Math.abs(starts[0]! - 100)).toBeLessThanOrEqual(10);
    expect(Math.abs(starts[1]! - 450)).toBeLessThanOrEqual(10);
  });

  it("sem palavras gera um ASS válido e vazio de eventos", () => {
    expect(parseAssDialogues(buildAss([]))).toEqual([]);
  });

  it("nome de fonte com vírgula não quebra a linha do estilo", () => {
    const style = buildAss(words, { fontName: "Foo, Bar" }).split("\n").find((l) => l.startsWith("Style:"))!;
    expect(style.split(",")).toHaveLength(23);
  });
});
