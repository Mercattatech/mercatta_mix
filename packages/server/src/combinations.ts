import {
  computeCut,
  DEFAULT_CAPTION_STYLE,
  findDurationViolations,
  generateCombinations,
  makeRenderPlan,
  renderPlanHash,
  sampleCombinations,
  VIDEO_FPS,
  type CaptionStyle,
  type Combination,
  type DurationViolation,
  type ExtraMode,
  type ExtraPosition,
  type RenderPlanPiece,
  type SegmentRef,
  type SegmentType,
  type Word,
} from "@mercatta/core";
import type { Db, Sql } from "./sql";
import { UserFacingError } from "./errors";

export interface GenerateOptions {
  organizationId: string;
  projectId: string;
  extraPosition?: ExtraPosition;
  extraMode?: ExtraMode;
  /** Gerar só uma amostra de N combinações (com cobertura máxima). */
  sample?: { n: number; seed?: number };
}

export interface GenerateResult {
  total: number;
  generated: number;
  combinations: { id: string; code: string; totalDurationMs: number; planHash: string }[];
  /** Combinações que passam do limite de duração de alguma rede de destino. */
  violations: DurationViolation[];
  /** Quantos vídeos seriam gerados, antes de qualquer amostra. */
  fullCount: number;
}

export interface SegmentRow {
  id: string;
  type: SegmentType;
  source_video_id: string;
  start_word_idx: number;
  end_word_idx: number;
  duration_ms: number | null;
  words: Word[] | null;
  provider: string | null;
  model: string | null;
  source_sha: string | null;
}

/** Peça do plano de render: tudo que define o corte e vai para o hash. */
export function planPieceFromRow(r: SegmentRow): RenderPlanPiece {
  return {
    segmentId: r.id,
    sourceVideoId: r.source_video_id,
    type: r.type,
    startWordIdx: r.start_word_idx,
    endWordIdx: r.end_word_idx,
    sourceSha256: r.source_sha!,
    transcriptKey: `${r.provider}:${r.model}`,
  };
}

/** Hash do plano (usado ao gerar as combinações E pelo worker antes de renderizar). */
export function computePlanHash(pieces: RenderPlanPiece[], style: Partial<CaptionStyle> | null): string {
  return renderPlanHash(makeRenderPlan(pieces, { style: style === null ? null : { ...DEFAULT_CAPTION_STYLE, ...style } }));
}

/**
 * Garante que todo vídeo de origem já processado ('ready') que ainda não possua nenhum trecho salvo
 * receba automaticamente o trecho padrão "Vídeo inteiro", para que todas as gravações enviadas entrem
 * nas combinações sem exigir cliques manuais em cada aba.
 */
export async function ensureDefaultSegments(sql: Sql, organizationId: string, projectId: string): Promise<void> {
  const missing = (
    await sql.query<{ id: string; type: SegmentType; duration_ms: number | null; words: Word[] | null; sort_order: number }>(
      `select sv.id, sv.type, sv.duration_ms, t.words, sv.sort_order
         from source_videos sv
         left join transcripts t on t.source_video_id = sv.id and t.organization_id = sv.organization_id
        where sv.organization_id = $1 and sv.project_id = $2 and sv.status = 'ready'
          and not exists (
            select 1 from segments s
             where s.organization_id = sv.organization_id
               and s.project_id = sv.project_id
               and s.source_video_id = sv.id
          )
        order by sv.sort_order, sv.created_at`,
      [organizationId, projectId],
    )
  ).rows;

  for (const sv of missing) {
    const words = sv.words ?? [];
    if (words.length === 0) continue;
    const startMs = Math.round(words[0]!.start_ms);
    const endMs = Math.round(words[words.length - 1]!.end_ms);
    if (endMs <= startMs) continue;
    await sql.query(
      `insert into segments (organization_id, project_id, source_video_id, type, start_word_idx, end_word_idx, start_ms, end_ms, label, sort_order)
       values ($1, $2, $3, $4, 0, $5, $6, $7, 'Vídeo inteiro', $8)`,
      [organizationId, projectId, sv.id, sv.type, words.length - 1, startMs, endMs, sv.sort_order],
    );
  }
}

const SEGMENTS_SQL = `
  select s.id, s.type, s.source_video_id, s.start_word_idx, s.end_word_idx,
         sv.duration_ms, t.words, t.provider, t.model, ma.sha256 as source_sha
  from segments s
  join source_videos sv on sv.id = s.source_video_id and sv.organization_id = s.organization_id
  left join transcripts t on t.source_video_id = sv.id and t.organization_id = sv.organization_id
  left join media_assets ma on ma.id = sv.asset_id and ma.organization_id = sv.organization_id
  where s.organization_id = $1 and s.project_id = $2
  order by array_position(array['hook','body','cta','extra'], s.type), s.sort_order, s.created_at, s.id`;

export async function loadCaptionStyle(sql: Sql, organizationId: string, projectId: string): Promise<Partial<CaptionStyle> | null> {
  const r = await sql.query<{ config: Partial<CaptionStyle> | null; settings?: { burn_captions?: boolean; caption_style?: Partial<CaptionStyle> } }>(
    `select cs.config, p.settings from projects p
       left join caption_styles cs on cs.id = p.caption_style_id and (cs.organization_id is null or cs.organization_id = p.organization_id)
      where p.organization_id = $1 and p.id = $2`,
    [organizationId, projectId],
  );
  if (r.rows[0]) {
    const s = r.rows[0].settings;
    if (s?.burn_captions === false) {
      return null;
    }
    return {
      ...(r.rows[0].config ?? {}),
      ...(s?.caption_style ?? {}),
    };
  }
  const def = await sql.query<{ config: Partial<CaptionStyle> | null }>(
    "select config from caption_styles where organization_id is null and is_default order by created_at limit 1",
  );
  return def.rows[0]?.config ?? {};
}

async function loadLimits(sql: Sql, organizationId: string, projectId: string): Promise<Record<string, number>> {
  const proj = await sql.query<{ target_networks: string[]; max_duration_ms: number | null }>(
    "select target_networks, max_duration_ms from projects where organization_id = $1 and id = $2",
    [organizationId, projectId],
  );
  const p = proj.rows[0];
  if (!p) throw new UserFacingError("Projeto não encontrado.");
  const settings = await sql.query<{ value: Record<string, number> }>("select value from platform_settings where key = 'network_duration_limits_ms'");
  const table = settings.rows[0]?.value ?? { default: 60_000 };
  const limits: Record<string, number> = {};
  const networks = p.target_networks.length > 0 ? p.target_networks : ["default"];
  for (const n of networks) limits[n] = table[n] ?? table.default ?? 60_000;
  if (p.max_duration_ms) limits["projeto"] = p.max_duration_ms;
  return limits;
}

/** Duração estimada de um trecho (corte por palavra + quadros inteiros), sem o ajuste fino de áudio. */
export function estimateSegmentMs(words: Word[], startIdx: number, endIdx: number, mediaDurationMs: number): number {
  const cut = computeCut(words, startIdx, endIdx, mediaDurationMs);
  const frames = Math.max(1, Math.round((cut.srcEndMs * VIDEO_FPS) / 1000) - Math.round((cut.srcStartMs * VIDEO_FPS) / 1000));
  return Math.round((frames * 1000) / VIDEO_FPS);
}

/** Quantos vídeos sairiam, sem gravar nada (a tela mostra isto ANTES de renderizar). */
export async function previewCombinations(sql: Sql, opts: GenerateOptions): Promise<{ fullCount: number; combos: Combination[]; violations: DurationViolation[] }> {
  await ensureDefaultSegments(sql, opts.organizationId, opts.projectId);
  const rows = (await sql.query<SegmentRow>(SEGMENTS_SQL, [opts.organizationId, opts.projectId])).rows;
  const refs = toRefs(rows);
  const all = generateCombinations(refs, { extraPosition: opts.extraPosition, extraMode: opts.extraMode });
  const limits = await loadLimits(sql, opts.organizationId, opts.projectId);
  return { fullCount: all.length, combos: all, violations: findDurationViolations(all, limits) };
}

function toRefs(rows: SegmentRow[]): SegmentRef[] {
  return rows.map((r) => {
    if (!r.words || !r.source_sha || !r.duration_ms) {
      throw new UserFacingError("Há vídeos ainda em processamento. Aguarde a transcrição terminar para gerar as combinações.");
    }
    return { id: r.id, type: r.type, durationMs: estimateSegmentMs(r.words, r.start_word_idx, r.end_word_idx, r.duration_ms) };
  });
}

/** Gera e grava as combinações do projeto (produto cartesiano ou amostra), com o hash do plano de cada uma. */
export async function generateProjectCombinations(db: Db, opts: GenerateOptions): Promise<GenerateResult> {
  return db.transaction(async (tx) => {
    await ensureDefaultSegments(tx, opts.organizationId, opts.projectId);
    const rows = (await tx.query<SegmentRow>(SEGMENTS_SQL, [opts.organizationId, opts.projectId])).rows;
    const refs = toRefs(rows);
    const all = generateCombinations(refs, { extraPosition: opts.extraPosition, extraMode: opts.extraMode });
    const chosen = opts.sample ? sampleCombinations(all, opts.sample.n, opts.sample.seed ?? 1) : all;

    const style = await loadCaptionStyle(tx, opts.organizationId, opts.projectId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const limits = await loadLimits(tx, opts.organizationId, opts.projectId);

    const saved: GenerateResult["combinations"] = [];
    for (const combo of chosen) {
      const pieces: RenderPlanPiece[] = combo.parts.map((p) => planPieceFromRow(byId.get(p.segmentId)!));
      const planHash = computePlanHash(pieces, style);
      const ids = Object.fromEntries(combo.parts.map((p) => [p.type, p.segmentId])) as Partial<Record<SegmentType, string>>;
      const res = await tx.query<{ id: string }>(
        `insert into combinations (organization_id, project_id, hook_segment_id, body_segment_id, cta_segment_id, extra_segment_id, code, sequence, style_key, total_duration_ms, plan_hash)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (project_id, code) do update set
           hook_segment_id = excluded.hook_segment_id, body_segment_id = excluded.body_segment_id,
           cta_segment_id = excluded.cta_segment_id, extra_segment_id = excluded.extra_segment_id,
           sequence = excluded.sequence,
           total_duration_ms = excluded.total_duration_ms, plan_hash = excluded.plan_hash, style_key = excluded.style_key
         returning id`,
        [opts.organizationId, opts.projectId, ids.hook, ids.body, ids.cta, ids.extra ?? null, combo.code, combo.parts.map((p) => p.type), combo.styleKey ?? null, Math.round(combo.totalDurationMs), planHash],
      );
      saved.push({ id: res.rows[0]!.id, code: combo.code, totalDurationMs: combo.totalDurationMs, planHash });
    }

    // combinações que não fazem mais parte do conjunto (ex.: trecho removido) saem
    await tx.query("delete from combinations where organization_id = $1 and project_id = $2 and not (code = any($3::text[]))", [
      opts.organizationId,
      opts.projectId,
      saved.map((s) => s.code),
    ]);

    return {
      total: all.length,
      generated: saved.length,
      fullCount: all.length,
      combinations: saved,
      violations: findDurationViolations(chosen, limits),
    };
  });
}
