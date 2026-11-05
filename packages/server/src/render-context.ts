import type { CaptionStyle, RenderPlanPiece, SegmentType, Word } from "@mercatta/core";
import { computePlanHash, loadCaptionStyle, planPieceFromRow, type SegmentRow } from "./combinations";
import { UserFacingError } from "./errors";
import type { Sql } from "./sql";

export interface RenderSegment extends SegmentRow {
  /** Chave do vídeo pré-processado no storage. */
  pre_key: string | null;
  words: Word[];
  duration_ms: number;
}

export interface RenderContext {
  render: { id: string; status: string; planHash: string; combinationId: string; projectId: string; code: string };
  /** Trechos na ordem em que entram no vídeo final. */
  segments: RenderSegment[];
  style: Partial<CaptionStyle>;
  burnCaptions?: boolean;
  pieces: RenderPlanPiece[];
  /** Hash recalculado agora a partir do que está no banco. Se diferir de render.planHash, o plano mudou. */
  currentPlanHash: string;
}

/** Carrega tudo que o worker precisa para renderizar uma combinação (sempre filtrando pela empresa). */
export async function loadRenderContext(sql: Sql, organizationId: string, renderId: string): Promise<RenderContext> {
  const r = (
    await sql.query<{ id: string; status: string; plan_hash: string; combination_id: string; project_id: string; code: string; sequence: SegmentType[]; hook: string; body: string; cta: string; extra: string | null }>(
      `select r.id, r.status, r.plan_hash, r.combination_id, r.project_id, c.code, c.sequence,
              c.hook_segment_id as hook, c.body_segment_id as body, c.cta_segment_id as cta, c.extra_segment_id as extra
         from renders r join combinations c on c.id = r.combination_id and c.organization_id = r.organization_id
        where r.organization_id = $1 and r.id = $2`,
      [organizationId, renderId],
    )
  ).rows[0];
  if (!r) throw new UserFacingError("Este vídeo não existe mais.");

  const idByType: Record<SegmentType, string | null> = { hook: r.hook, body: r.body, cta: r.cta, extra: r.extra };
  const ids = Object.values(idByType).filter((x): x is string => !!x);
  const rows = (
    await sql.query<RenderSegment>(
      `select s.id, s.type, s.source_video_id, s.start_word_idx, s.end_word_idx,
              sv.duration_ms, pa.r2_key as pre_key, t.words, t.provider, t.model, ma.sha256 as source_sha
         from segments s
         join source_videos sv on sv.id = s.source_video_id and sv.organization_id = s.organization_id
         left join transcripts t on t.source_video_id = sv.id and t.organization_id = sv.organization_id
         left join media_assets ma on ma.id = sv.asset_id and ma.organization_id = sv.organization_id
         left join media_assets pa on pa.id = sv.preprocessed_asset_id and pa.organization_id = sv.organization_id
        where s.organization_id = $1 and s.id = any($2::uuid[])`,
      [organizationId, ids],
    )
  ).rows;
  const byId = new Map(rows.map((x) => [x.id, x]));

  const segments = r.sequence.map((type) => {
    const id = idByType[type];
    const seg = id ? byId.get(id) : undefined;
    if (!seg) throw new UserFacingError("Um dos trechos desta combinação foi removido. Gere as combinações de novo.");
    if (!seg.words || !seg.pre_key || !seg.source_sha || !seg.duration_ms) {
      throw new UserFacingError("Um dos vídeos ainda não terminou de ser processado.");
    }
    return seg;
  });

  const style = await loadCaptionStyle(sql, organizationId, r.project_id);
  const pieces = segments.map(planPieceFromRow);
  return {
    render: { id: r.id, status: r.status, planHash: r.plan_hash, combinationId: r.combination_id, projectId: r.project_id, code: r.code },
    segments,
    style: style ?? {},
    burnCaptions: style !== null,
    pieces,
    currentPlanHash: computePlanHash(pieces, style),
  };
}
