/** Pré-processamento: ffprobe → 1080×1920, 30 fps, H.264, AAC 48 kHz, volume normalizado. */

export interface ProbeInfo {
  durationMs: number;
  /** Largura e altura como o vídeo é EXIBIDO (já considerando a rotação do celular). */
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  isHdr: boolean;
  rotation: number;
  videoCodec: string;
}

export class ProbeError extends Error {}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  color_transfer?: string;
  side_data_list?: { rotation?: number }[];
  tags?: { rotate?: string };
}

export interface FfprobeJson {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

function parseRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [n, d] = rate.split("/").map(Number);
  if (!n || !d) return 0;
  return n / d;
}

/** Interpreta a saída de `ffprobe -print_format json -show_streams -show_format`. */
export function parseProbe(json: FfprobeJson): ProbeInfo {
  const video = json.streams?.find((s) => s.codec_type === "video" && (s.width ?? 0) > 0);
  if (!video) throw new ProbeError("O arquivo não tem faixa de vídeo");
  const hasAudio = !!json.streams?.some((s) => s.codec_type === "audio");

  const rawRotation = video.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation ?? Number(video.tags?.rotate ?? 0);
  const rotation = ((Math.round(rawRotation) % 360) + 360) % 360;
  const swap = rotation === 90 || rotation === 270;

  const durationSec = Number(json.format?.duration ?? video.duration ?? 0);
  if (!(durationSec > 0)) throw new ProbeError("Não foi possível ler a duração do vídeo");

  const fps = parseRate(video.avg_frame_rate) || parseRate(video.r_frame_rate);
  const transfer = video.color_transfer ?? "";

  return {
    durationMs: Math.round(durationSec * 1000),
    width: swap ? video.height! : video.width!,
    height: swap ? video.width! : video.height!,
    fps,
    hasAudio,
    isHdr: transfer === "smpte2084" || transfer === "arib-std-b67",
    rotation,
    videoCodec: video.codec_name ?? "unknown",
  };
}

export interface LoudnormMeasure {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

export const LOUDNORM_TARGET = { i: -15, tp: -1.5, lra: 11 } as const;

/** Extrai o JSON que o filtro loudnorm imprime no stderr (passo de medição). */
export function parseLoudnormJson(stderr: string): LoudnormMeasure {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) throw new ProbeError("Saída do loudnorm não encontrada");
  const data = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  for (const key of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]) {
    const v = data[key];
    if (v === undefined || !Number.isFinite(Number(v))) {
      throw new ProbeError("Não deu para medir o volume do áudio (sem fala ou áudio mudo?)");
    }
  }
  return data as unknown as LoudnormMeasure;
}

export function buildLoudnormMeasureArgs(input: string): string[] {
  const { i, tp, lra } = LOUDNORM_TARGET;
  return ["-hide_banner", "-nostdin", "-i", input, "-vn", "-af", `loudnorm=I=${i}:TP=${tp}:LRA=${lra}:print_format=json`, "-f", "null", "-"];
}

/** Filtro de HDR → SDR (BT.709). Requer FFmpeg com zimg (zscale). */
const HDR_TO_SDR =
  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv";

export type FitMode = "auto" | "cover" | "blur-pad";

/** Vídeo já vertical (proporção ~9:16) é preenchido; horizontal vira primeiro plano sobre fundo desfocado. */
export function chooseFit(width: number, height: number, mode: FitMode = "auto"): "cover" | "blur-pad" {
  if (mode !== "auto") return mode;
  const aspect = width / height;
  return aspect <= 0.7 ? "cover" : "blur-pad";
}

export interface PreprocessInput {
  input: string;
  output: string;
  probe: ProbeInfo;
  loudnorm: LoudnormMeasure;
  width?: number;
  height?: number;
  fps?: number;
  fit?: FitMode;
}

export function buildPreprocessArgs(opts: PreprocessInput): string[] {
  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;
  const fps = opts.fps ?? 30;
  if (!opts.probe.hasAudio) throw new ProbeError("O vídeo não tem áudio (a transcrição precisa da fala)");

  const hdr = opts.probe.isHdr ? `${HDR_TO_SDR},` : "";
  const fit = chooseFit(opts.probe.width, opts.probe.height, opts.fit);
  const tail = `fps=${fps},setsar=1,format=yuv420p`;
  const video =
    fit === "cover"
      ? `[0:v]${hdr}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${tail}[v]`
      : `[0:v]${hdr}split[a][b];` +
        `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:5[bg];` +
        `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,${tail}[v]`;

  const m = opts.loudnorm;
  const { i, tp, lra } = LOUDNORM_TARGET;
  const audio =
    `[0:a:0]loudnorm=I=${i}:TP=${tp}:LRA=${lra}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
    `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,` +
    `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`;

  return [
    "-y", "-hide_banner", "-nostdin",
    "-i", opts.input,
    "-filter_complex", `${video};${audio}`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-r", String(fps), "-fps_mode", "cfr", "-g", String(fps * 2), "-bf", "2",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    opts.output,
  ];
}
