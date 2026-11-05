import type { SegmentType } from "./types";

export interface SegmentRef {
  id: string;
  type: SegmentType;
  /** Duração do trecho em ms (já com as margens de corte). */
  durationMs: number;
}

export type ExtraPosition = "afterHook" | "afterBody" | "afterCta";
export type ExtraMode = "include" | "optional";

export interface CombinationOptions {
  /** Estilos de legenda/edição. Se houver mais de um, o nome do arquivo ganha o sufixo do estilo. */
  styles?: string[];
  /** Onde o tipo opcional (ex.: Prova social) entra na sequência. Padrão: depois do miolo. */
  extraPosition?: ExtraPosition;
  /** "include": todo vídeo leva um trecho extra. "optional": inclui também a opção sem extra. */
  extraMode?: ExtraMode;
}

export interface CombinationPart {
  type: SegmentType;
  segmentId: string;
  /** Posição (1-based) do trecho dentro do seu tipo. */
  ordinal: number;
}

export interface Combination {
  /** Ex.: H1_M2_C1 (ou H1_M2_X1_C1; com mais de um estilo: H1_M2_C1_estiloA). */
  code: string;
  parts: CombinationPart[];
  styleKey?: string;
  totalDurationMs: number;
}

const PREFIX: Record<SegmentType, string> = { hook: "H", body: "M", cta: "C", extra: "X" };

export class CombinationError extends Error {}

interface Item {
  ref: SegmentRef;
  ordinal: number;
}

function groupByType(segments: SegmentRef[]): Record<SegmentType, Item[]> {
  const groups: Record<SegmentType, Item[]> = { hook: [], body: [], cta: [], extra: [] };
  const seen = new Set<string>();
  for (const ref of segments) {
    if (seen.has(ref.id)) throw new CombinationError(`Trecho repetido: ${ref.id}`);
    seen.add(ref.id);
    const list = groups[ref.type];
    list.push({ ref, ordinal: list.length + 1 });
  }
  return groups;
}

function sequence(extraPosition: ExtraPosition): SegmentType[] {
  switch (extraPosition) {
    case "afterHook":
      return ["hook", "extra", "body", "cta"];
    case "afterCta":
      return ["hook", "body", "cta", "extra"];
    default:
      return ["hook", "body", "extra", "cta"];
  }
}

function safeStyleKey(key: string): string {
  const safe = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safe) throw new CombinationError(`Nome de estilo inválido: "${key}"`);
  return safe;
}

function requireBase(groups: Record<SegmentType, Item[]>) {
  const total = groups.hook.length + groups.body.length + groups.cta.length + groups.extra.length;
  if (total === 0) {
    throw new CombinationError("Nenhum trecho salvo no projeto.");
  }
}

/** Quantidade de vídeos que serão gerados (mostrada ANTES de renderizar). */
export function countCombinations(
  counts: { hook: number; body: number; cta: number; extra?: number },
  options: Pick<CombinationOptions, "styles" | "extraMode"> = {},
): number {
  const styles = Math.max(1, options.styles?.length ?? 1);
  const extra = counts.extra ?? 0;
  const extraFactor = extra === 0 ? 1 : options.extraMode === "optional" ? extra + 1 : extra;
  const hasAny = counts.hook > 0 || counts.body > 0 || counts.cta > 0 || extra > 0;
  if (!hasAny) return 0;
  return (counts.hook || 1) * (counts.body || 1) * (counts.cta || 1) * extraFactor * styles;
}

/** Produto cartesiano gancho × miolo × (extra) × CTA × estilos, em ordem estável. */
export function generateCombinations(segments: SegmentRef[], options: CombinationOptions = {}): Combination[] {
  const groups = groupByType(segments);
  requireBase(groups);

  const styles = (options.styles ?? []).map(safeStyleKey);
  if (new Set(styles).size !== styles.length) throw new CombinationError("Estilos com nomes repetidos");
  const styleList: (string | undefined)[] = styles.length > 1 ? styles : [styles[0]];

  const slots: (Item | null)[][] = sequence(options.extraPosition ?? "afterBody")
    .filter((t) => groups[t].length > 0)
    .map((t) => {
      const items: (Item | null)[] = [...groups[t]];
      if (t === "extra" && options.extraMode === "optional") items.push(null);
      return items;
    });

  const result: Combination[] = [];
  const pick: (Item | null)[] = [];

  const walk = (depth: number) => {
    if (depth === slots.length) {
      const chosen = pick.filter((i): i is Item => i !== null);
      const parts: CombinationPart[] = chosen.map((i) => ({ type: i.ref.type, segmentId: i.ref.id, ordinal: i.ordinal }));
      const base = parts.map((p) => `${PREFIX[p.type]}${p.ordinal}`).join("_");
      const total = chosen.reduce((sum, i) => sum + i.ref.durationMs, 0);
      for (const style of styleList) {
        const showStyle = styles.length > 1 && style !== undefined;
        result.push({
          code: showStyle ? `${base}_${style}` : base,
          parts,
          ...(showStyle ? { styleKey: style } : {}),
          totalDurationMs: total,
        });
      }
      return;
    }
    for (const item of slots[depth]!) {
      pick[depth] = item;
      walk(depth + 1);
    }
  };
  walk(0);
  return result;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Amostra de N combinações que maximiza a cobertura: cada trecho (e estilo) aparece
 * o quanto antes. Determinística para a mesma semente. Mantém a ordem original.
 */
export function sampleCombinations(all: Combination[], n: number, seed = 1): Combination[] {
  if (!Number.isInteger(n) || n < 0) throw new CombinationError("Tamanho da amostra inválido");
  if (n >= all.length) return [...all];
  const rng = mulberry32(seed);
  const covered = new Set<string>();
  const chosen = new Set<number>();
  const keysOf = (c: Combination) => [
    ...c.parts.map((p) => `seg:${p.segmentId}`),
    ...(c.styleKey ? [`style:${c.styleKey}`] : []),
  ];

  while (chosen.size < n) {
    let bestScore = -1;
    let best: number[] = [];
    for (let i = 0; i < all.length; i++) {
      if (chosen.has(i)) continue;
      const score = keysOf(all[i]!).filter((k) => !covered.has(k)).length;
      if (score > bestScore) {
        bestScore = score;
        best = [i];
      } else if (score === bestScore) best.push(i);
    }
    const idx = best[Math.floor(rng() * best.length)]!;
    chosen.add(idx);
    keysOf(all[idx]!).forEach((k) => covered.add(k));
  }
  return [...chosen].sort((a, b) => a - b).map((i) => all[i]!);
}
