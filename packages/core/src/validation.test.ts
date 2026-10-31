import { describe, expect, it } from "vitest";
import { generateCombinations, type SegmentRef } from "./combinations";
import { jobIdempotencyKey, planHash, stableStringify } from "./hash";
import { estimateCredits, findDurationViolations, validateUpload } from "./validation";

describe("hash", () => {
  it("stableStringify ignora a ordem das chaves e valores undefined", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] }, u: undefined })).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}');
  });
  it("planos iguais → mesmo hash; diferentes → hash diferente", () => {
    expect(planHash({ a: 1, b: 2 })).toBe(planHash({ b: 2, a: 1 }));
    expect(planHash({ a: 1 })).not.toBe(planHash({ a: 2 }));
    expect(planHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
  it("idempotência: mesma entrada = mesma chave", () => {
    expect(jobIdempotencyKey("render", { c: "H1_M1_C1", p: "x" })).toBe(jobIdempotencyKey("render", { p: "x", c: "H1_M1_C1" }));
    expect(jobIdempotencyKey("render", { p: 1 })).not.toBe(jobIdempotencyKey("zip", { p: 1 }));
  });
});

describe("findDurationViolations", () => {
  const segs: SegmentRef[] = [
    { id: "h1", type: "hook", durationMs: 5000 },
    { id: "m1", type: "body", durationMs: 30000 },
    { id: "m2", type: "body", durationMs: 50000 },
    { id: "c1", type: "cta", durationMs: 8000 },
  ];
  const combos = generateCombinations(segs);

  it("aponta quais combinações passam do limite de cada rede", () => {
    const v = findDurationViolations(combos, { instagram: 60_000, tiktok: 90_000, x: 140_000 });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ code: "H1_M2_C1", network: "instagram", totalMs: 63_000, overByMs: 3000 });
  });
  it("sem violações devolve vazio", () => {
    expect(findDurationViolations(combos, { instagram: 90_000 })).toEqual([]);
  });
  it("igual ao limite não é violação", () => {
    expect(findDurationViolations(combos, { instagram: 63_000 })).toEqual([]);
  });
});

describe("validateUpload", () => {
  it("aceita mp4, mov e mkv até 3 min", () => {
    for (const name of ["a.mp4", "B.MOV", "c.mkv"]) expect(validateUpload({ name, sizeBytes: 1000, durationMs: 180_000 })).toEqual([]);
  });
  it("aponta formato, tamanho e duração", () => {
    expect(validateUpload({ name: "a.avi", sizeBytes: 1 })).toEqual(["extension"]);
    expect(validateUpload({ name: "a.mp4", sizeBytes: 6 * 1024 ** 3 })).toEqual(["size"]);
    expect(validateUpload({ name: "a.mp4", sizeBytes: 1, durationMs: 180_001 })).toEqual(["duration"]);
    expect(validateUpload({ name: "semextensao", sizeBytes: 1 })).toEqual(["extension"]);
  });
});

describe("estimateCredits", () => {
  it("multiplica renders pelo custo", () => {
    expect(estimateCredits(12, { perRender: 3 })).toBe(36);
    expect(estimateCredits(0, { perRender: 3 })).toBe(0);
    expect(() => estimateCredits(-1, { perRender: 3 })).toThrow();
  });
});
