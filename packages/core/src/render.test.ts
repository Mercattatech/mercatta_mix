import { describe, expect, it } from "vitest";
import { buildRenderArgs, RenderPlanError } from "./render";
import { buildTimeline } from "./timeline";

const timeline = buildTimeline([
  { segmentId: "h1", sourceVideoId: "vh", type: "hook", srcStartMs: 1000, srcEndMs: 4000, words: [] },
  { segmentId: "m1", sourceVideoId: "vm", type: "body", srcStartMs: 2000, srcEndMs: 12000, words: [] },
  { segmentId: "c1", sourceVideoId: "vh", type: "cta", srcStartMs: 6000, srcEndMs: 9000, words: [] }, // mesma origem do gancho
]);
const inputs = { vh: "/w/h.mp4", vm: "/w/m.mp4" };

describe("buildRenderArgs", () => {
  const args = buildRenderArgs({ inputs, timeline, assFileName: "subs.ass", fontsDirName: "fonts", outPath: "out.mp4" });
  const fc = args[args.indexOf("-filter_complex") + 1]!;

  it("usa um -i por vídeo de origem, sem duplicar", () => {
    expect(args.filter((a) => a === "-i")).toHaveLength(2);
    expect(args.slice(args.indexOf("-i"), args.indexOf("-i") + 2)).toEqual(["-i", "/w/h.mp4"]);
  });

  it("corta por quadro e por amostra exatos", () => {
    expect(fc).toContain("[0:v]trim=start_frame=30:end_frame=120");
    expect(fc).toContain("[0:a]atrim=start_sample=48000:end_sample=192000");
    expect(fc).toContain("[1:v]trim=start_frame=60:end_frame=360");
    expect(fc).toContain("[0:v]trim=start_frame=180:end_frame=270");
  });

  it("aplica fade de 50 ms nas duas pontas de cada trecho", () => {
    expect(fc).toContain("afade=t=in:st=0:d=0.05,afade=t=out:st=2.95:d=0.05[a0]");
    expect(fc).toContain("afade=t=out:st=9.95:d=0.05[a1]");
  });

  it("emenda tudo com concat e queima a legenda depois", () => {
    expect(fc).toContain("[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[vcat][acat]");
    expect(fc).toContain("[vcat]scale=1080:1920,ass=subs.ass:fontsdir=fonts[vout]");
    expect(args).toContain("[vout]");
    expect(args).toContain("[acat]");
  });

  it("codifica em H.264 yuv420p, 30 fps CFR, AAC 48 kHz", () => {
    const s = args.join(" ");
    expect(s).toContain("-c:v libx264");
    expect(s).toContain("-pix_fmt yuv420p");
    expect(s).toContain("-r 30 -fps_mode cfr");
    expect(s).toContain("-c:a aac -b:a 160k -ar 48000");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("sem legenda, mapeia o vídeo concatenado direto", () => {
    const a = buildRenderArgs({ inputs, timeline, outPath: "out.mp4" });
    expect(a.join(" ")).not.toContain("ass=");
    expect(a).toContain("[vcat]");
  });

  it("é determinístico", () => {
    expect(buildRenderArgs({ inputs, timeline, assFileName: "subs.ass", outPath: "out.mp4" })).toEqual(
      buildRenderArgs({ inputs, timeline, assFileName: "subs.ass", outPath: "out.mp4" }),
    );
  });

  it("limita o fade à metade de um trecho curtíssimo", () => {
    const t = buildTimeline([{ segmentId: "x", sourceVideoId: "vh", type: "hook", srcStartMs: 0, srcEndMs: 66, words: [] }]);
    const a = buildRenderArgs({ inputs, timeline: t, outPath: "o.mp4" });
    expect(a[a.indexOf("-filter_complex") + 1]).toContain("afade=t=in:st=0:d=0.033333");
  });

  it("rejeita nomes que precisariam de escape no filtro e arquivos ausentes", () => {
    expect(() => buildRenderArgs({ inputs, timeline, assFileName: "a:b.ass", outPath: "o.mp4" })).toThrow(RenderPlanError);
    expect(() => buildRenderArgs({ inputs, timeline, assFileName: "a.ass", fontsDirName: "../f", outPath: "o.mp4" })).toThrow(RenderPlanError);
    expect(() => buildRenderArgs({ inputs: { vh: "/x" }, timeline, outPath: "o.mp4" })).toThrow(/ausente/);
  });
});
