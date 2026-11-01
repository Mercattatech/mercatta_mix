import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWords, type RawWord, type Word } from "@mercatta/core";
import { run } from "./exec";

export interface TranscriptResult {
  words: Word[];
  text: string;
  provider: string;
  model: string;
  language: string;
}

/** Interface própria: trocar de provedor (faster-whisper, OpenAI, outro) não muda o resto do sistema. */
export interface Transcriber {
  readonly provider: string;
  readonly model: string;
  transcribe(input: { mediaPath: string; language: string; workDir: string }): Promise<TranscriptResult>;
}

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * faster-whisper local (Python) para o texto + alinhamento forçado wav2vec2 para os tempos de palavra (padrão).
 * Sem custo por minuto e sem depender do desligamento do whisper-1. `WHISPER_ALIGN=off` usa só os tempos nativos.
 */
export class FasterWhisperTranscriber implements Transcriber {
  readonly provider = "faster-whisper";
  /** Rótulo gravado/consultado no cache: muda quando muda o modelo OU o alinhador. */
  readonly model: string;
  private readonly whisperModel: string;
  constructor(
    whisperModel = process.env.WHISPER_MODEL ?? "large-v3-turbo",
    private readonly python = process.env.PYTHON_BIN ?? "python3",
    private readonly script = path.join(HERE, "../python/transcribe.py"),
    align = process.env.WHISPER_ALIGN !== "off",
  ) {
    this.whisperModel = whisperModel;
    this.model = align ? `${whisperModel}+wav2vec2` : whisperModel;
  }

  async transcribe({ mediaPath, language }: { mediaPath: string; language: string }): Promise<TranscriptResult> {
    const { stdout } = await run(this.python, [this.script, mediaPath, language, this.whisperModel]);
    const json = JSON.parse(stdout.toString()) as { language: string; text: string; words: RawWord[] };
    return { words: normalizeWords(json.words), text: json.text, provider: this.provider, model: this.model, language: json.language };
  }
}

/** OpenAI whisper-1 (único com tempo por palavra hoje; desligamento previsto para fev/2027 — manter como alternativa). */
export class OpenAiWhisperTranscriber implements Transcriber {
  readonly provider = "openai";
  readonly model = "whisper-1";
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async transcribe({ mediaPath, language, workDir }: { mediaPath: string; language: string; workDir: string }): Promise<TranscriptResult> {
    const wav = path.join(workDir, "openai-audio.wav");
    await run(FFMPEG, ["-y", "-hide_banner", "-nostdin", "-i", mediaPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
    const form = new FormData();
    form.set("model", this.model);
    form.set("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    if (language !== "auto") form.set("language", language);
    form.set("file", new Blob([new Uint8Array(await readFile(wav))], { type: "audio/wav" }), "audio.wav");

    const res = await this.fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`OpenAI transcription falhou: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { text: string; language?: string; words?: { word: string; start: number; end: number }[] };
    const raw: RawWord[] = (json.words ?? []).map((w) => ({ w: w.word, start_ms: w.start * 1000, end_ms: w.end * 1000 }));
    return { words: normalizeWords(raw), text: json.text, provider: this.provider, model: this.model, language: json.language ?? language };
  }
}
