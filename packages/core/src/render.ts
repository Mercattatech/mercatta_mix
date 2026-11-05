import type { Timeline } from "./timeline";

export interface RenderArgsInput {
  /** Caminhos dos vídeos pré-processados (30 fps, 48 kHz), por id do vídeo de origem. */
  inputs: Record<string, string>;
  timeline: Timeline;
  /** Nome (sem diretório) do .ass dentro do diretório de trabalho. Omitir = sem legenda. */
  assFileName?: string;
  /** Nome (sem diretório) da pasta de fontes dentro do diretório de trabalho. */
  fontsDirName?: string;
  /** Nome (sem diretório) do .ffconcat de PNGs de legenda (fallback quando FFmpeg não tem libass). */
  overlayConcatFile?: string;
  outPath: string;
  /** Fade de áudio em cada ponta de trecho. Padrão 50 ms (faixa pedida: 40–60 ms). */
  fadeMs?: number;
  width?: number;
  height?: number;
  crf?: number;
  preset?: string;
}

export class RenderPlanError extends Error {}

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function num(n: number): string {
  return Number(n.toFixed(6)).toString();
}

/**
 * Argumentos do FFmpeg para renderizar UMA variação, em um único comando:
 * trim/atrim exatos por quadro/amostra + fade de áudio + concat + legenda ASS queimada.
 *
 * Deve ser executado com o diretório de trabalho (cwd) onde estão o .ass e a pasta de fontes,
 * assim os nomes no filtro não precisam de escape.
 *
 * Determinístico: o mesmo plano gera sempre os mesmos argumentos.
 */
export function buildRenderArgs(input: RenderArgsInput): string[] {
  const { timeline } = input;
  const fadeSec = (input.fadeMs ?? 50) / 1000;
  const width = input.width ?? 1080;
  const height = input.height ?? 1920;

  if (timeline.pieces.length === 0) throw new RenderPlanError("Linha do tempo vazia");
  if (input.assFileName && !SAFE_NAME.test(input.assFileName)) throw new RenderPlanError(`Nome de legenda inválido: ${input.assFileName}`);
  if (input.fontsDirName && !SAFE_NAME.test(input.fontsDirName)) throw new RenderPlanError(`Nome de pasta de fontes inválido: ${input.fontsDirName}`);
  if (input.overlayConcatFile && !SAFE_NAME.test(input.overlayConcatFile)) throw new RenderPlanError(`Nome de legenda concat inválido: ${input.overlayConcatFile}`);

  // Um -i por vídeo de origem, na ordem em que aparece.
  const sourceIds: string[] = [];
  for (const p of timeline.pieces) if (!sourceIds.includes(p.sourceVideoId)) sourceIds.push(p.sourceVideoId);
  const args: string[] = ["-y", "-hide_banner", "-nostdin"];
  for (const id of sourceIds) {
    const path = input.inputs[id];
    if (!path) throw new RenderPlanError(`Arquivo de origem ausente para o vídeo ${id}`);
    args.push("-i", path);
  }
  const overlaySubIdx = !input.assFileName && input.overlayConcatFile ? sourceIds.length : -1;
  if (overlaySubIdx >= 0) {
    args.push("-f", "concat", "-safe", "0", "-i", input.overlayConcatFile!);
  }

  const chains: string[] = [];
  const concatInputs: string[] = [];
  timeline.pieces.forEach((p, i) => {
    const idx = sourceIds.indexOf(p.sourceVideoId);
    const durSec = p.frames / timeline.fps;
    const fade = Math.min(fadeSec, durSec / 2);
    chains.push(
      `[${idx}:v]trim=start_frame=${p.srcStartFrame}:end_frame=${p.srcStartFrame + p.frames},setpts=PTS-STARTPTS,fps=${timeline.fps},format=yuv420p,setsar=1[v${i}]`,
    );
    chains.push(
      `[${idx}:a]atrim=start_sample=${p.srcStartSample}:end_sample=${p.srcEndSample},asetpts=PTS-STARTPTS,` +
        `afade=t=in:st=0:d=${num(fade)},afade=t=out:st=${num(durSec - fade)}:d=${num(fade)}[a${i}]`,
    );
    concatInputs.push(`[v${i}][a${i}]`);
  });
  chains.push(`${concatInputs.join("")}concat=n=${timeline.pieces.length}:v=1:a=1[vcat][acat]`);

  let videoLabel = "vcat";
  if (input.assFileName) {
    const fonts = input.fontsDirName ? `:fontsdir=${input.fontsDirName}` : "";
    chains.push(`[vcat]scale=${width}:${height},ass=${input.assFileName}${fonts}[vout]`);
    videoLabel = "vout";
  } else if (overlaySubIdx >= 0) {
    chains.push(`[vcat]scale=${width}:${height}[vscaled]`);
    chains.push(`[${overlaySubIdx}:v]fps=${timeline.fps},format=rgba[vsub]`);
    chains.push(`[vscaled][vsub]overlay=0:0:eof_action=pass[vout]`);
    videoLabel = "vout";
  }

  args.push(
    "-filter_complex", chains.join(";"),
    "-map", `[${videoLabel}]`,
    "-map", "[acat]",
    "-c:v", "libx264",
    "-preset", input.preset ?? "medium",
    "-crf", String(input.crf ?? 20),
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-r", String(timeline.fps),
    "-fps_mode", "cfr",
    "-c:a", "aac",
    "-b:a", "160k",
    "-ar", String(timeline.sampleRate),
    "-ac", "2",
    "-movflags", "+faststart",
    input.outPath,
  );
  return args;
}
