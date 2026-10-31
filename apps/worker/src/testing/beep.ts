import type { Word } from "@mercatta/core";
import { run } from "../exec";
import type { Transcriber, TranscriptResult } from "../transcriber";

/**
 * Ferramentas de teste: vídeos sintéticos em que cada "palavra" é um bipe de tempo conhecido, mais um
 * zumbido baixo e contínuo (para que um estalo numa emenda apareça como salto no sinal).
 * Não há ASR nos testes: o BeepTranscriber acha os bipes pelo ÁUDIO — um medidor independente da linha do tempo.
 */

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

// 137 Hz NÃO divide 48000/30 = 1600 amostras por quadro (150 Hz dividia: todo corte cairia na fase 0 e nunca estalaria)
export const HUM_FREQ = 137;
export const HUM_AMPLITUDE = 0.05;
export const BEEP_AMPLITUDE = 0.5;
const RAMP_S = 0.02;

export interface BeepSpec {
  startS: number;
  endS: number;
}

function beepGate(b: BeepSpec): string {
  return `between(t,${b.startS},${b.endS})*min(1,(t-${b.startS})/${RAMP_S})*min(1,(${b.endS}-t)/${RAMP_S})`;
}

/** Cria um MP4 vertical (540×960, 30 fps) com bipes de `freq` Hz nos intervalos dados. */
export async function makeBeepVideo(out: string, opts: { seconds: number; freq: number; beeps: BeepSpec[] }): Promise<void> {
  const gate = opts.beeps.map(beepGate).join("+");
  const expr = `${HUM_AMPLITUDE}*sin(2*PI*${HUM_FREQ}*t)+${BEEP_AMPLITUDE}*sin(2*PI*${opts.freq}*t)*(${gate})`;
  await run(FFMPEG, [
    "-y", "-hide_banner", "-nostdin",
    "-f", "lavfi", "-i", `testsrc2=size=540x960:rate=30:duration=${opts.seconds}`,
    "-f", "lavfi", "-i", `aevalsrc='${expr}':s=48000:d=${opts.seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", out,
  ]);
}

export async function decodeMono(file: string, sampleRate: number): Promise<Float32Array> {
  const { stdout } = await run(FFMPEG, ["-hide_banner", "-nostdin", "-i", file, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-"], { binary: true });
  const aligned = stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength - (stdout.byteLength % 4));
  return new Float32Array(aligned as ArrayBuffer);
}

/** Acha os bipes pela energia (janelas de 5 ms; ativo = acima de 40% do pico). */
export function detectBeeps(samples: Float32Array, sampleRate: number): { startMs: number; endMs: number }[] {
  const win = Math.round(sampleRate * 0.005);
  const n = Math.floor(samples.length / win);
  const rms: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * win; j < (i + 1) * win; j++) s += samples[j]! * samples[j]!;
    rms.push(Math.sqrt(s / win));
  }
  const peak = Math.max(0, ...rms);
  if (peak === 0) return [];
  const threshold = peak * 0.4;
  const out: { startMs: number; endMs: number }[] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const active = i < n && rms[i]! > threshold;
    if (active && start < 0) start = i;
    if (!active && start >= 0) {
      out.push({ startMs: start * 5, endMs: i * 5 });
      start = -1;
    }
  }
  // junta pedaços separados por menos de 30 ms (o cruzamento por zero do tom cria "buracos" falsos)
  const merged: { startMs: number; endMs: number }[] = [];
  for (const b of out) {
    const last = merged[merged.length - 1];
    if (last && b.startMs - last.endMs < 30) last.endMs = b.endMs;
    else merged.push({ ...b });
  }
  return merged;
}

/** Maior salto entre amostras vizinhas dentro de [fromMs, toMs]. */
export function maxStepIn(samples: Float32Array, sampleRate: number, fromMs: number, toMs: number): number {
  const a = Math.max(1, Math.round((fromMs * sampleRate) / 1000));
  const b = Math.min(samples.length, Math.round((toMs * sampleRate) / 1000));
  let m = 0;
  for (let i = a; i < b; i++) m = Math.max(m, Math.abs(samples[i]! - samples[i - 1]!));
  return m;
}

/** "Transcritor" de teste: cada bipe vira uma palavra com o tempo medido no próprio áudio. */
export class BeepTranscriber implements Transcriber {
  readonly provider = "beep-test";
  readonly model = "v1";
  calls = 0;

  async transcribe({ mediaPath, language }: { mediaPath: string; language: string; workDir: string }): Promise<TranscriptResult> {
    this.calls++;
    const beeps = detectBeeps(await decodeMono(mediaPath, 16000), 16000);
    const words: Word[] = beeps.map((b, i) => ({ w: `p${i + 1}`, start_ms: b.startMs, end_ms: b.endMs }));
    return { words, text: words.map((w) => w.w).join(" "), provider: this.provider, model: this.model, language };
  }
}
