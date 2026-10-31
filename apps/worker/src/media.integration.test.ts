import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTimeline, computeCut, type Word } from "@mercatta/core";
import { run } from "./exec";
import { energyEnvelope, hasAssFilter, preprocess, probe, renderVariation } from "./media";

/**
 * Teste de integração com FFmpeg real e vídeos sintéticos (sem arquivos de fixture):
 * valida o pré-processamento, o render com emendas e a ausência de estalo.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tmp");
let dir: string;
let hook: string;
let body: string;
let libass = false;

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

async function synth(out: string, seconds: number, freq: number) {
  await run(FFMPEG, [
    "-y", "-hide_banner", "-nostdin",
    "-f", "lavfi", "-i", `testsrc2=size=1080x1920:rate=30:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=${freq}:sample_rate=48000:duration=${seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", out,
  ]);
}

async function decodeAudio(file: string): Promise<Float32Array> {
  const { stdout } = await run(FFMPEG, ["-hide_banner", "-nostdin", "-i", file, "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], { binary: true });
  const aligned = stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength - (stdout.byteLength % 4));
  return new Float32Array(aligned as ArrayBuffer);
}

/** Maior salto entre amostras vizinhas, ignorando os primeiros/últimos 50 ms (início/fim do arquivo). */
function maxStep(a: Float32Array): number {
  let m = 0;
  for (let i = 2400; i < a.length - 2400; i++) m = Math.max(m, Math.abs(a[i]! - a[i - 1]!));
  return m;
}

async function videoFrames(file: string): Promise<number> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file]);
  return Number(stdout.toString().trim());
}

async function streamDurations(file: string): Promise<{ v: number; a: number }> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "json", file]);
  const j = JSON.parse(stdout.toString()) as { streams: { codec_type: string; duration: string }[] };
  const get = (t: string) => Number(j.streams.find((s) => s.codec_type === t)!.duration);
  return { v: get("video"), a: get("audio") };
}

beforeAll(async () => {
  await mkdir(ROOT, { recursive: true });
  dir = await mkdtemp(path.join(ROOT, "it-"));
  await synth(path.join(dir, "hook_raw.mp4"), 8, 440);
  await synth(path.join(dir, "body_raw.mp4"), 10, 440);
  hook = path.join(dir, "hook.mp4");
  body = path.join(dir, "body.mp4");
  await preprocess(path.join(dir, "hook_raw.mp4"), hook);
  await preprocess(path.join(dir, "body_raw.mp4"), body);
  libass = await hasAssFilter();
}, 120_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("pré-processamento", () => {
  it("entrega 1080×1920, 30 fps, com áudio", async () => {
    const info = await probe(hook);
    expect(info.width).toBe(1080);
    expect(info.height).toBe(1920);
    expect(info.fps).toBeCloseTo(30, 3);
    expect(info.hasAudio).toBe(true);
    expect(Math.abs(info.durationMs - 8000)).toBeLessThan(80);
  });
});

describe("render com emendas", () => {
  // Cortes escolhidos para o pior caso: o 1º trecho termina com a senóide longe de zero
  // (quadro 91: fase ≈ -0,87) e o 2º começa perto de zero → salto grande SEM fade.
  const hookWords: Word[] = [{ w: "oi", start_ms: 500, end_ms: 900 }];
  const bodyWords: Word[] = [{ w: "gente", start_ms: 2100, end_ms: 2600 }];

  const timeline = buildTimeline([
    { segmentId: "h1", sourceVideoId: "hook", type: "hook", srcStartMs: 0, srcEndMs: 3033, words: hookWords },
    { segmentId: "m1", sourceVideoId: "body", type: "body", srcStartMs: 2000, srcEndMs: 6000, words: bodyWords },
    { segmentId: "c1", sourceVideoId: "hook", type: "cta", srcStartMs: 4000, srcEndMs: 6500, words: [] }, // mesma origem do gancho
  ]);

  it("renderiza com a mesma origem em dois trechos, no tamanho e duração corretos", async () => {
    const out = path.join(dir, "H1_M1_C1.mp4");
    await renderVariation({ workDir: path.join(dir, "w1"), sources: { hook, body }, timeline, outFile: out, captions: false });

    const info = await probe(out);
    expect(info.width).toBe(1080);
    expect(info.height).toBe(1920);
    expect(info.fps).toBeCloseTo(30, 3);
    expect(await videoFrames(out)).toBe(timeline.totalFrames);
    expect(Math.abs(info.durationMs - timeline.totalDurationMs)).toBeLessThan(60);
    expect(timeline.totalDurationMs).toBeLessThanOrEqual(60_000);

    const d = await streamDurations(out);
    expect(Math.abs(d.v - d.a)).toBeLessThan(0.05);
  }, 120_000);

  it("não há estalo nas emendas (salto de áudio ≤ o da própria senóide)", async () => {
    const out = path.join(dir, "click.mp4");
    await renderVariation({ workDir: path.join(dir, "w2"), sources: { hook, body }, timeline, outFile: out, captions: false });

    const natural = maxStep(await decodeAudio(hook));
    const rendered = maxStep(await decodeAudio(out));
    expect(rendered).toBeLessThanOrEqual(natural * 1.5);
  }, 120_000);

  it("controle negativo: sem fade o mesmo corte estala (o detector funciona)", async () => {
    // concat cru, sem afade, dos mesmos pontos de corte
    const raw = path.join(dir, "nofade.mp4");
    await run(FFMPEG, [
      "-y", "-hide_banner", "-nostdin", "-i", hook, "-i", body,
      "-filter_complex",
      "[0:a]atrim=start_sample=0:end_sample=145600,asetpts=PTS-STARTPTS[a0];[1:a]atrim=start_sample=96000:end_sample=288000,asetpts=PTS-STARTPTS[a1];[a0][a1]concat=n=2:v=0:a=1[a]",
      "-map", "[a]", "-c:a", "pcm_s16le", raw.replace(".mp4", ".wav"),
    ]);
    const natural = maxStep(await decodeAudio(hook));
    const step = maxStep(await decodeAudio(raw.replace(".mp4", ".wav")));
    expect(step).toBeGreaterThan(natural * 3);
  }, 60_000);

  it("é determinístico: mesmo plano, mesmo vídeo", async () => {
    const a = path.join(dir, "det_a.mp4");
    const b = path.join(dir, "det_b.mp4");
    await renderVariation({ workDir: path.join(dir, "w3"), sources: { hook, body }, timeline, outFile: a, captions: false });
    await renderVariation({ workDir: path.join(dir, "w4"), sources: { hook, body }, timeline, outFile: b, captions: false });
    const hash = async (f: string) => {
      const { stdout } = await run(FFMPEG, ["-hide_banner", "-nostdin", "-i", f, "-map", "0:v", "-f", "framemd5", "-"]);
      return stdout.toString().split("\n").filter((l) => !l.startsWith("#")).join("\n");
    };
    expect(await hash(a)).toBe(await hash(b));
  }, 180_000);

  it.skipIf(!process.env.FORCE_ASS_TEST)("com legenda queimada (requer FFmpeg com libass)", async () => {
    expect(libass).toBe(true);
    const out = path.join(dir, "subs.mp4");
    await renderVariation({ workDir: path.join(dir, "w5"), sources: { hook, body }, timeline, outFile: out });
    expect(await videoFrames(out)).toBe(timeline.totalFrames);
  }, 120_000);
});

describe("envelope de energia", () => {
  it("achata o silêncio e mede a senóide", async () => {
    const env = await energyEnvelope(hook, 10);
    expect(env.stepMs).toBe(10);
    expect(env.values.length).toBeGreaterThan(700);
    expect(Math.max(...env.values)).toBeGreaterThan(0.05);
  });

  it("o ajuste fino usa o envelope real sem quebrar o corte", async () => {
    const words: Word[] = [
      { w: "a", start_ms: 1000, end_ms: 1500 },
      { w: "b", start_ms: 2000, end_ms: 2500 },
      { w: "c", start_ms: 4000, end_ms: 4500 },
    ];
    const env = await energyEnvelope(hook, 10);
    const cut = computeCut(words, 1, 1, 8000, { envelope: env });
    expect(cut.srcStartMs).toBeGreaterThanOrEqual(1500);
    expect(cut.srcStartMs).toBeLessThanOrEqual(2000);
    expect(cut.srcEndMs).toBeGreaterThanOrEqual(2500);
    expect(cut.srcEndMs).toBeLessThanOrEqual(4000);
  });
});
