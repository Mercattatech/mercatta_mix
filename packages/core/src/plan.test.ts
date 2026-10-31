import { describe, expect, it } from "vitest";
import { makeRenderPlan, renderPlanHash, type RenderPlanPiece } from "./plan";

const piece = (id: string, over: Partial<RenderPlanPiece> = {}): RenderPlanPiece => ({
  segmentId: id,
  sourceVideoId: "v-" + id,
  type: "hook",
  startWordIdx: 0,
  endWordIdx: 10,
  sourceSha256: "sha-" + id,
  transcriptKey: "t-" + id,
  ...over,
});

describe("renderPlanHash", () => {
  const base = () => makeRenderPlan([piece("h1"), piece("m1", { type: "body" })]);

  it("mesmo plano → mesmo hash", () => {
    expect(renderPlanHash(base())).toBe(renderPlanHash(base()));
  });

  it("muda se o trecho, o estilo ou o fade mudar", () => {
    const h = renderPlanHash(base());
    expect(renderPlanHash(makeRenderPlan([piece("h1", { endWordIdx: 11 }), piece("m1", { type: "body" })]))).not.toBe(h);
    expect(renderPlanHash(makeRenderPlan([piece("h1"), piece("m1", { type: "body" })], { style: { uppercase: false } }))).not.toBe(h);
    expect(renderPlanHash(makeRenderPlan([piece("h1"), piece("m1", { type: "body" })], { fadeMs: 40 }))).not.toBe(h);
    expect(renderPlanHash(makeRenderPlan([piece("h1"), piece("m1", { type: "body" })], { style: null }))).not.toBe(h);
  });

  it("a ordem dos trechos importa", () => {
    const a = makeRenderPlan([piece("h1"), piece("m1")]);
    const b = makeRenderPlan([piece("m1"), piece("h1")]);
    expect(renderPlanHash(a)).not.toBe(renderPlanHash(b));
  });

  it("se o arquivo de origem for trocado, o hash muda", () => {
    expect(renderPlanHash(makeRenderPlan([piece("h1", { sourceSha256: "outro" })]))).not.toBe(renderPlanHash(makeRenderPlan([piece("h1")])));
  });
});
