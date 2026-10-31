import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildAss,
  buildLoudnormMeasureArgs,
  buildPreprocessArgs,
  buildRenderArgs,
  parseLoudnormJson,
  parseProbe,
  type CaptionStyle,
  type EnergyEnvelope,
  type FfprobeJson,
  type LoudnormMeasure,
  type ProbeInfo,
  type Timeline,
} from "@mercatta/core";
import { run } from "./exec";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

export async function probe(file: string): Promise<ProbeInfo> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
  return parseProbe(JSON.parse(stdout.toString()) as FfprobeJson);
}

export async function measureLoudness(file: string): Promise<LoudnormMeasure> {
  const { stderr } = await run(FFMPEG, buildLoudnormMeasureArgs(file));
  return parseLoudnormJson(stderr);
}

/** Converte para 1080×1920, 30 fps, H.264/AAC 48 kHz e volume normalizado (dois passos). */
export async function preprocess(input: string, output: string): Promise<ProbeInfo> {
  const info = await probe(input);
  const loudnorm = await measureLoudness(input);
  await run(FFMPEG, buildPreprocessArgs({ input, output, probe: info, loudnorm }));
  return probe(output);
}

/** Envelope de energia (RMS por passo) do áudio, para achar o ponto mais silencioso perto do corte. */
export async function energyEnvelope(file: string, stepMs = 10): Promise<EnergyEnvelope> {
  const rate = 16000;
  const { stdout } = await run(FFMPEG, ["-hide_banner", "-nostdin", "-i", file, "-vn", "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { binary: true });
  // copia para um ArrayBuffer alinhado (o Buffer do Node pode começar em offset não múltiplo de 4)
  const aligned = stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength - (stdout.byteLength % 4));
  const samples = new Float32Array(aligned as ArrayBuffer);
  const win = Math.round((rate * stepMs) / 1000);
  const n = Math.floor(samples.length / win);
  const values: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    // janela centrada no instante i*step
    const start = Math.max(0, i * win - Math.floor(win / 2));
    const end = Math.min(samples.length, start + win);
    for (let j = start; j < end; j++) sum += samples[j]! * samples[j]!;
    values[i] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return { stepMs, values };
}

export interface RenderVariationInput {
  workDir: string;
  /** Vídeos de origem já pré-processados, por id. */
  sources: Record<string, string>;
  timeline: Timeline;
  outFile: string;
  captions?: { style?: Partial<CaptionStyle>; fontsDir?: string } | false;
  fadeMs?: number;
}

/** Renderiza uma variação: escreve o ASS, monta o comando único e executa com cwd no diretório de trabalho. */
export async function renderVariation(input: RenderVariationInput): Promise<void> {
  await mkdir(input.workDir, { recursive: true });
  let assFileName: string | undefined;
  let fontsDirName: string | undefined;

  if (input.captions !== false && input.timeline.captionWords.length > 0) {
    assFileName = "subs.ass";
    await writeFile(path.join(input.workDir, assFileName), buildAss(input.timeline.captionWords, input.captions?.style));
    const fontsDir = input.captions?.fontsDir;
    if (fontsDir) {
      fontsDirName = "fonts";
      await mkdir(path.join(input.workDir, fontsDirName), { recursive: true });
      for (const f of await readdir(fontsDir)) await copyFile(path.join(fontsDir, f), path.join(input.workDir, fontsDirName, f));
    }
  }

  const outName = "out.mp4";
  const args = buildRenderArgs({
    inputs: input.sources,
    timeline: input.timeline,
    ...(assFileName ? { assFileName } : {}),
    ...(fontsDirName ? { fontsDirName } : {}),
    ...(input.fadeMs !== undefined ? { fadeMs: input.fadeMs } : {}),
    outPath: outName,
  });
  await run(FFMPEG, args, { cwd: input.workDir });
  await copyFile(path.join(input.workDir, outName), input.outFile);
}

/** O FFmpeg local tem o filtro `ass` (libass)? */
export async function hasAssFilter(): Promise<boolean> {
  const { stdout } = await run(FFMPEG, ["-hide_banner", "-filters"]);
  return /\bass\b/.test(stdout.toString());
}
