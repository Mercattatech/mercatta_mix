import { describe, expect, it } from "vitest";
import {
  CombinationError,
  countCombinations,
  generateCombinations,
  sampleCombinations,
  type SegmentRef,
} from "./combinations";

const seg = (id: string, type: SegmentRef["type"], durationMs = 5000): SegmentRef => ({ id, type, durationMs });

const base: SegmentRef[] = [
  seg("h1", "hook", 4000),
  seg("h2", "hook", 5000),
  seg("h3", "hook", 6000),
  seg("m1", "body", 20000),
  seg("m2", "body", 22000),
  seg("c1", "cta", 7000),
  seg("c2", "cta", 8000),
];

describe("generateCombinations", () => {
  it("3 ganchos × 2 miolos × 2 CTAs = 12, com nomes H1_M1_C1 etc.", () => {
    const combos = generateCombinations(base);
    expect(combos).toHaveLength(12);
    expect(combos.map((c) => c.code)).toEqual([
      "H1_M1_C1", "H1_M1_C2", "H1_M2_C1", "H1_M2_C2",
      "H2_M1_C1", "H2_M1_C2", "H2_M2_C1", "H2_M2_C2",
      "H3_M1_C1", "H3_M1_C2", "H3_M2_C1", "H3_M2_C2",
    ]);
    expect(new Set(combos.map((c) => c.code)).size).toBe(12);
  });

  it("soma a duração dos trechos escolhidos", () => {
    const combos = generateCombinations(base);
    const h2m2c2 = combos.find((c) => c.code === "H2_M2_C2")!;
    expect(h2m2c2.totalDurationMs).toBe(5000 + 22000 + 8000);
  });

  it("a ordem dos trechos é gancho, miolo, CTA", () => {
    const c = generateCombinations(base)[0]!;
    expect(c.parts.map((p) => p.type)).toEqual(["hook", "body", "cta"]);
  });

  it("quarto tipo entra entre miolo e CTA por padrão e no nome", () => {
    const combos = generateCombinations([...base, seg("x1", "extra", 3000), seg("x2", "extra", 3500)]);
    expect(combos).toHaveLength(24);
    expect(combos[0]!.code).toBe("H1_M1_X1_C1");
    expect(combos[0]!.parts.map((p) => p.type)).toEqual(["hook", "body", "extra", "cta"]);
  });

  it("posição do extra configurável", () => {
    const combos = generateCombinations([...base, seg("x1", "extra")], { extraPosition: "afterCta" });
    expect(combos[0]!.code).toBe("H1_M1_C1_X1");
  });

  it("extra opcional inclui também a versão sem extra", () => {
    const combos = generateCombinations([...base, seg("x1", "extra", 3000)], { extraMode: "optional" });
    expect(combos).toHaveLength(24);
    expect(combos.filter((c) => !c.code.includes("X")).length).toBe(12);
  });

  it("com mais de um estilo, o nome ganha o sufixo do estilo", () => {
    const combos = generateCombinations(base, { styles: ["Amarelo", "Minimalista"] });
    expect(combos).toHaveLength(24);
    expect(combos[0]!.code).toBe("H1_M1_C1_Amarelo");
    expect(combos[1]!.code).toBe("H1_M1_C1_Minimalista");
    expect(combos[1]!.styleKey).toBe("Minimalista");
  });

  it("com um único estilo, o nome não leva sufixo", () => {
    const combos = generateCombinations(base, { styles: ["Amarelo"] });
    expect(combos).toHaveLength(12);
    expect(combos[0]!.code).toBe("H1_M1_C1");
  });

  it("sanitiza o nome do estilo para nome de arquivo seguro", () => {
    const combos = generateCombinations(base, { styles: ["Estilo Açaí/1", "B"] });
    expect(combos[0]!.code).toBe("H1_M1_C1_Estilo-Acai-1");
  });

  it("estilos repetidos geram erro", () => {
    expect(() => generateCombinations(base, { styles: ["A", "a b", "A"] })).toThrow(CombinationError);
  });

  it("gera combinacoes mesmo se faltar miolo ou extra, mantendo gancho no inicio e CTA no fim", () => {
    const withoutBody = base.filter((s) => s.type !== "body");
    const combos = generateCombinations(withoutBody);
    expect(combos).toHaveLength(6); // 3 hooks x 2 ctas
    expect(combos[0]!.code).toBe("H1_C1");
    expect(combos[0]!.parts.map((p) => p.type)).toEqual(["hook", "cta"]);
    expect(() => generateCombinations([])).toThrow(CombinationError);
  });

  it("rejeita trecho repetido", () => {
    expect(() => generateCombinations([...base, seg("h1", "hook")])).toThrow(CombinationError);
  });

  it("10 × 10 × 10 = 1000 combinações", () => {
    const many: SegmentRef[] = [];
    for (const [t, p] of [["hook", "h"], ["body", "m"], ["cta", "c"]] as const) {
      for (let i = 1; i <= 10; i++) many.push(seg(`${p}${i}`, t));
    }
    const combos = generateCombinations(many);
    expect(combos).toHaveLength(1000);
    expect(combos[999]!.code).toBe("H10_M10_C10");
    expect(new Set(combos.map((c) => c.code)).size).toBe(1000);
  });
});

describe("countCombinations", () => {
  it("bate com o que generateCombinations produz", () => {
    expect(countCombinations({ hook: 3, body: 2, cta: 2 })).toBe(12);
    expect(countCombinations({ hook: 3, body: 2, cta: 2, extra: 2 })).toBe(24);
    expect(countCombinations({ hook: 3, body: 2, cta: 2, extra: 1 }, { extraMode: "optional" })).toBe(24);
    expect(countCombinations({ hook: 3, body: 2, cta: 2 }, { styles: ["a", "b"] })).toBe(24);
  });
});

describe("sampleCombinations", () => {
  const all = generateCombinations(base);

  it("devolve tudo se N >= total", () => {
    expect(sampleCombinations(all, 12)).toHaveLength(12);
    expect(sampleCombinations(all, 99)).toHaveLength(12);
  });

  it("devolve N combinações distintas, na ordem original", () => {
    const s = sampleCombinations(all, 5, 7);
    expect(s).toHaveLength(5);
    expect(new Set(s.map((c) => c.code)).size).toBe(5);
    const idx = s.map((c) => all.indexOf(c));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("maximiza a cobertura: com N=3 todos os ganchos aparecem", () => {
    const s = sampleCombinations(all, 3, 42);
    expect(new Set(s.map((c) => c.parts[0]!.segmentId))).toEqual(new Set(["h1", "h2", "h3"]));
  });

  it("é determinística para a mesma semente", () => {
    expect(sampleCombinations(all, 4, 3).map((c) => c.code)).toEqual(sampleCombinations(all, 4, 3).map((c) => c.code));
  });

  it("rejeita tamanho inválido", () => {
    expect(() => sampleCombinations(all, -1)).toThrow(CombinationError);
    expect(() => sampleCombinations(all, 1.5)).toThrow(CombinationError);
  });
});
