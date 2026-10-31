import type { CaptionWord } from "./types";

export interface CaptionStyle {
  fontName: string;
  fontSize: number;
  /** Cores no formato #RRGGBB. */
  primaryColor: string;
  highlightColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadow: number;
  bold: boolean;
  uppercase: boolean;
  position: "top" | "middle" | "bottom";
  /** Distância da borda (em px do vídeo 1080×1920). */
  marginV: number;
  marginH: number;
  /** "karaoke": palavra por palavra, destacando a falada. "static": bloco inteiro. */
  mode: "karaoke" | "static";
  maxWordsPerLine: number;
  maxCharsPerLine: number;
  /** Pausa maior que isso começa uma nova linha de legenda. */
  maxGapMs: number;
  /** Quanto a última palavra de uma linha fica na tela após terminar. */
  holdMs: number;
  playResX: number;
  playResY: number;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontName: "DejaVu Sans",
  fontSize: 78,
  primaryColor: "#FFFFFF",
  highlightColor: "#FFD400",
  outlineColor: "#000000",
  outlineWidth: 6,
  shadow: 2,
  bold: true,
  uppercase: true,
  position: "bottom",
  marginV: 360,
  marginH: 60,
  mode: "karaoke",
  maxWordsPerLine: 3,
  maxCharsPerLine: 22,
  maxGapMs: 600,
  holdMs: 200,
  playResX: 1080,
  playResY: 1920,
};

const ALIGNMENT = { bottom: 2, middle: 5, top: 8 } as const;

/** "#RRGGBB" → "&H00BBGGRR" (formato do ASS). */
export function assColor(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`Cor inválida: ${hex}`);
  const rr = m[1]!.slice(0, 2);
  const gg = m[1]!.slice(2, 4);
  const bb = m[1]!.slice(4, 6);
  return `&H00${bb}${gg}${rr}`.toUpperCase();
}

/** ms → "H:MM:SS.cc" (centésimos, arredondado). */
export function assTime(ms: number): string {
  const totalCs = Math.max(0, Math.round(ms / 10));
  const cs = totalCs % 100;
  const s = Math.floor(totalCs / 100) % 60;
  const m = Math.floor(totalCs / 6000) % 60;
  const h = Math.floor(totalCs / 360000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "").replace(/\{/g, "(").replace(/\}/g, ")").replace(/[\r\n]+/g, " ").trim();
}

const SENTENCE_END = /[.!?…]$/;

/** Agrupa as palavras em linhas curtas de legenda. */
export function groupCaptionChunks(words: CaptionWord[], style: Pick<CaptionStyle, "maxWordsPerLine" | "maxCharsPerLine" | "maxGapMs">): CaptionWord[][] {
  const chunks: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  let chars = 0;
  for (const word of words) {
    const text = word.text.trim();
    if (!text) continue;
    const prev = cur[cur.length - 1];
    const gap = prev ? word.startMs - prev.endMs : 0;
    const wouldBe = chars + (cur.length ? 1 : 0) + text.length;
    const split =
      cur.length > 0 &&
      (cur.length >= style.maxWordsPerLine || wouldBe > style.maxCharsPerLine || gap > style.maxGapMs || SENTENCE_END.test(prev!.text.trim()));
    if (split) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push({ ...word, text });
    chars += (cur.length > 1 ? 1 : 0) + text.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export interface AssEvent {
  startMs: number;
  endMs: number;
  text: string;
}

/** Eventos de legenda (um por palavra no modo karaokê). Tempo já na linha do tempo de saída. */
export function buildCaptionEvents(words: CaptionWord[], partial: Partial<CaptionStyle> = {}): AssEvent[] {
  const style = { ...DEFAULT_CAPTION_STYLE, ...partial };
  const chunks = groupCaptionChunks(words, style);
  const casing = (t: string) => escapeText(style.uppercase ? t.toLocaleUpperCase("pt-BR") : t);
  const primary = assColor(style.primaryColor);
  const highlight = assColor(style.highlightColor);
  const events: AssEvent[] = [];

  chunks.forEach((chunk, ci) => {
    const nextChunkStart = chunks[ci + 1]?.[0]?.startMs ?? Infinity;
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    const chunkEnd = Math.min(last.endMs + style.holdMs, nextChunkStart);

    if (style.mode === "static") {
      events.push({ startMs: first.startMs, endMs: chunkEnd, text: chunk.map((w) => casing(w.text)).join(" ") });
      return;
    }

    chunk.forEach((word, wi) => {
      const start = word.startMs;
      const end = wi < chunk.length - 1 ? chunk[wi + 1]!.startMs : chunkEnd;
      if (end <= start) return;
      const text = chunk
        .map((w, i) => (i === wi ? `{\\c${highlight}}${casing(w.text)}{\\c${primary}}` : casing(w.text)))
        .join(" ");
      events.push({ startMs: start, endMs: end, text });
    });
  });
  return events;
}

/** Gera o arquivo ASS completo (queimado depois pelo FFmpeg/libass). */
export function buildAss(words: CaptionWord[], partial: Partial<CaptionStyle> = {}): string {
  const style = { ...DEFAULT_CAPTION_STYLE, ...partial };
  const font = style.fontName.replace(/[,\r\n]/g, " ").trim();
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${style.playResX}`,
    `PlayResY: ${style.playResY}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${font},${style.fontSize},${assColor(style.primaryColor)},${assColor(style.highlightColor)},${assColor(style.outlineColor)},&H64000000,${style.bold ? -1 : 0},0,0,0,100,100,0,0,1,${style.outlineWidth},${style.shadow},${ALIGNMENT[style.position]},${style.marginH},${style.marginH},${style.marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const lines = buildCaptionEvents(words, style).map((e) => {
    const start = assTime(e.startMs);
    let end = assTime(e.endMs);
    if (end === start) end = assTime(e.startMs + 10);
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${e.text}`;
  });
  return [...header, ...lines, ""].join("\n");
}

/** Lê os Dialogue de um ASS (usado nos testes e no script de aceite de sincronia). */
export function parseAssDialogues(ass: string): { startMs: number; endMs: number; text: string }[] {
  const out: { startMs: number; endMs: number; text: string }[] = [];
  const toMs = (t: string) => {
    const m = /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/.exec(t.trim());
    if (!m) throw new Error(`Tempo ASS inválido: ${t}`);
    return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4]) * 10;
  };
  for (const line of ass.split(/\r?\n/)) {
    if (!line.startsWith("Dialogue:")) continue;
    const parts = line.slice("Dialogue:".length).split(",");
    const text = parts.slice(9).join(",");
    out.push({ startMs: toMs(parts[1]!), endMs: toMs(parts[2]!), text });
  }
  return out;
}
