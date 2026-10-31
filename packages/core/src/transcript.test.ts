import { describe, expect, it } from "vitest";
import { normalizeWords } from "./transcript";

describe("normalizeWords", () => {
  it("remove palavras vazias e ordena por início", () => {
    const out = normalizeWords([
      { w: " b ", start_ms: 500, end_ms: 800 },
      { w: "   ", start_ms: 100, end_ms: 200 },
      { w: "a", start_ms: 100, end_ms: 400 },
    ]);
    expect(out.map((w) => w.w)).toEqual(["a", "b"]);
  });

  it("corrige sobreposição encurtando a palavra anterior", () => {
    const out = normalizeWords([
      { w: "a", start_ms: 100, end_ms: 600 },
      { w: "b", start_ms: 500, end_ms: 900 },
    ]);
    expect(out[0]).toMatchObject({ start_ms: 100, end_ms: 500 });
    expect(out[1]).toMatchObject({ start_ms: 500, end_ms: 900 });
  });

  it("nunca deixa palavra com duração menor que 10 ms nem fim antes do início", () => {
    const out = normalizeWords([
      { w: "a", start_ms: 100, end_ms: 100 },
      { w: "b", start_ms: 105, end_ms: 90 },
    ]);
    for (const w of out) expect(w.end_ms - w.start_ms).toBeGreaterThanOrEqual(10);
    expect(out[1]!.start_ms).toBeGreaterThanOrEqual(out[0]!.end_ms);
  });

  it("arredonda para ms inteiros, corta negativos e preserva a confiança", () => {
    const out = normalizeWords([{ w: "a", start_ms: -5.4, end_ms: 100.6, conf: 0.9 }]);
    expect(out[0]).toEqual({ w: "a", start_ms: 0, end_ms: 101, conf: 0.9 });
  });

  it("ignora tempos inválidos (NaN)", () => {
    expect(normalizeWords([{ w: "a", start_ms: NaN, end_ms: 100 }])).toEqual([]);
  });
});
