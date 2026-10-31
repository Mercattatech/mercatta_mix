import { COMBINER_UPLOAD_RULES, jobIdempotencyKey, validateUpload, type SegmentType, type UploadRules, type Word } from "@mercatta/core";
import { resetJob, upsertJob } from "./jobs";
import { UserFacingError } from "./errors";
import type { Db, Sql } from "./sql";

const TYPES: readonly SegmentType[] = ["hook", "body", "cta", "extra"];

export function isSegmentType(v: unknown): v is SegmentType {
  return typeof v === "string" && (TYPES as readonly string[]).includes(v);
}

async function loadUploadRules(sql: Sql): Promise<UploadRules> {
  const r = await sql.query<{ value: { max_bytes?: number; max_duration_ms?: number; extensions?: string[] } }>("select value from platform_settings where key = 'upload_limits'");
  const v = r.rows[0]?.value;
  return {
    maxBytes: v?.max_bytes ?? COMBINER_UPLOAD_RULES.maxBytes,
    maxDurationMs: v?.max_duration_ms ?? COMBINER_UPLOAD_RULES.maxDurationMs,
    extensions: v?.extensions ?? COMBINER_UPLOAD_RULES.extensions,
  };
}

export const ISSUE_MESSAGES = {
  extension: "Formato não aceito. Envie um arquivo MP4, MOV ou MKV.",
  size: "Arquivo grande demais. O limite é de 5 GB por vídeo.",
  duration: "Vídeo longo demais. O limite é de 3 minutos por vídeo.",
} as const;

export interface NewUpload {
  organizationId: string;
  projectId: string;
  type: SegmentType;
  filename: string;
  sizeBytes: number;
  userId?: string;
}

/** Registra o vídeo (status "enviando") e reserva o lugar no storage. Valida formato e tamanho antes de qualquer envio. */
export async function createSourceVideo(db: Db, input: NewUpload): Promise<{ sourceVideoId: string; key: string; maxBytes: number }> {
  return db.transaction(async (tx) => {
    const rules = await loadUploadRules(tx);
    const issues = validateUpload({ name: input.filename, sizeBytes: input.sizeBytes }, rules);
    if (issues.length > 0) throw new UserFacingError(ISSUE_MESSAGES[issues[0]!]);
    if (!(input.sizeBytes > 0)) throw new UserFacingError("O arquivo está vazio.");

    const project = await tx.query("select 1 from projects where organization_id = $1 and id = $2 and status <> 'archived'", [input.organizationId, input.projectId]);
    if (project.rows.length === 0) throw new UserFacingError("Projeto não encontrado.");

    const ext = input.filename.split(".").pop()!.toLowerCase();
    const sv = (
      await tx.query<{ id: string }>(
        `insert into source_videos (organization_id, project_id, type, original_filename, status, sort_order)
         values ($1, $2, $3, $4, 'uploading',
                 (select coalesce(max(sort_order), -1) + 1 from source_videos where organization_id = $1 and project_id = $2 and type = $3))
         returning id`,
        [input.organizationId, input.projectId, input.type, input.filename.slice(0, 200)],
      )
    ).rows[0]!;
    const key = `org/${input.organizationId}/src/${sv.id}.${ext}`;
    const asset = (
      await tx.query<{ id: string }>(
        "insert into media_assets (organization_id, kind, r2_key, size_bytes, mime, status) values ($1, 'source', $2, $3, $4, 'pending') returning id",
        [input.organizationId, key, input.sizeBytes, ext === "mov" ? "video/quicktime" : ext === "mkv" ? "video/x-matroska" : "video/mp4"],
      )
    ).rows[0]!;
    await tx.query("update source_videos set asset_id = $3 where organization_id = $1 and id = $2", [input.organizationId, sv.id, asset.id]);
    return { sourceVideoId: sv.id, key, maxBytes: rules.maxBytes };
  });
}

export async function getSourceVideoForUpload(sql: Sql, organizationId: string, sourceVideoId: string): Promise<{ key: string; mime: string; status: string; assetId: string; sizeBytes: number }> {
  const r = await sql.query<{ r2_key: string; mime: string | null; status: string; asset_id: string; size_bytes: string }>(
    `select a.r2_key, a.mime, sv.status, a.id as asset_id, a.size_bytes
       from source_videos sv join media_assets a on a.id = sv.asset_id and a.organization_id = sv.organization_id
      where sv.organization_id = $1 and sv.id = $2`,
    [organizationId, sourceVideoId],
  );
  const row = r.rows[0];
  if (!row) throw new UserFacingError("Vídeo não encontrado.");
  return { key: row.r2_key, mime: row.mime ?? "video/mp4", status: row.status, assetId: row.asset_id, sizeBytes: Number(row.size_bytes) };
}

/** Termina o envio: marca como enviado e cria o job de processamento (idempotente). Devolve o job a publicar na fila. */
export async function finishUpload(
  db: Db,
  input: { organizationId: string; sourceVideoId: string; language?: string },
): Promise<{ jobId: string; sourceVideoId: string; language: string; created: boolean }> {
  return db.transaction(async (tx) => {
    const sv = (
      await tx.query<{ project_id: string; asset_id: string; status: string }>("select project_id, asset_id, status from source_videos where organization_id = $1 and id = $2", [
        input.organizationId,
        input.sourceVideoId,
      ])
    ).rows[0];
    if (!sv) throw new UserFacingError("Vídeo não encontrado.");
    if (sv.status === "uploading" || sv.status === "failed") {
      await tx.query("update source_videos set status = 'uploaded', error_pt = null where organization_id = $1 and id = $2", [input.organizationId, input.sourceVideoId]);
    }
    const language = input.language ?? "pt";
    const job = await upsertJob(tx, {
      organizationId: input.organizationId,
      projectId: sv.project_id,
      kind: "upload_process",
      idempotencyKey: jobIdempotencyKey("upload_process", { sourceVideoId: input.sourceVideoId, assetId: sv.asset_id, language }),
      payload: { sourceVideoId: input.sourceVideoId, language },
      refType: "source_video",
      refId: input.sourceVideoId,
    });
    if (!job.created && (job.status === "failed" || job.status === "canceled")) await resetJob(tx, input.organizationId, job.id);
    return { jobId: job.id, sourceVideoId: input.sourceVideoId, language, created: job.created || job.status === "failed" || job.status === "canceled" };
  });
}

export interface NewSegment {
  organizationId: string;
  projectId: string;
  sourceVideoId: string;
  startWordIdx: number;
  endWordIdx: number;
  label?: string;
}

/** Cria um trecho a partir de um intervalo de palavras da transcrição (o tempo vem das palavras, não do cliente). */
export async function createSegment(db: Db, input: NewSegment): Promise<{ id: string; startMs: number; endMs: number }> {
  return db.transaction(async (tx) => {
    const row = (
      await tx.query<{ type: SegmentType; words: Word[] | null }>(
        `select sv.type, t.words from source_videos sv left join transcripts t on t.source_video_id = sv.id and t.organization_id = sv.organization_id
          where sv.organization_id = $1 and sv.project_id = $2 and sv.id = $3`,
        [input.organizationId, input.projectId, input.sourceVideoId],
      )
    ).rows[0];
    if (!row) throw new UserFacingError("Vídeo não encontrado neste projeto.");
    if (!row.words) throw new UserFacingError("Este vídeo ainda não foi transcrito.");
    const { startWordIdx: a, endWordIdx: b } = input;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a || b >= row.words.length) throw new UserFacingError("Seleção de palavras inválida.");
    const startMs = Math.round(row.words[a]!.start_ms);
    const endMs = Math.round(row.words[b]!.end_ms);
    if (endMs <= startMs) throw new UserFacingError("A seleção é curta demais.");

    const seg = (
      await tx.query<{ id: string }>(
        `insert into segments (organization_id, project_id, source_video_id, type, start_word_idx, end_word_idx, start_ms, end_ms, label, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 (select coalesce(max(sort_order), -1) + 1 from segments where organization_id = $1 and project_id = $2 and type = $4))
         returning id`,
        [input.organizationId, input.projectId, input.sourceVideoId, row.type, a, b, startMs, endMs, input.label?.slice(0, 80) ?? null],
      )
    ).rows[0]!;
    return { id: seg.id, startMs, endMs };
  });
}

/** Prepara o job do ZIP com os vídeos prontos (ou os escolhidos). Mesmo conjunto = mesmo job. */
export async function prepareZip(db: Db, input: { organizationId: string; projectId: string; renderIds?: string[] }): Promise<{ jobId: string; renderIds: string[] }> {
  return db.transaction(async (tx) => {
    const rows = (
      await tx.query<{ id: string }>(
        `select id from renders where organization_id = $1 and project_id = $2 and status = 'succeeded'
            and ($3::uuid[] is null or id = any($3::uuid[])) order by id`,
        [input.organizationId, input.projectId, input.renderIds ?? null],
      )
    ).rows;
    if (rows.length === 0) throw new UserFacingError("Nenhum vídeo pronto para baixar ainda.");
    const renderIds = rows.map((r) => r.id);
    const job = await upsertJob(tx, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      kind: "zip",
      idempotencyKey: jobIdempotencyKey("zip", { projectId: input.projectId, renderIds }),
      payload: { renderIds },
    });
    // job falho/cancelado de um ZIP igual: volta para a fila
    if (!job.created && (job.status === "failed" || job.status === "canceled")) {
      await tx.query("update jobs set status = 'queued', progress = 0, error_pt = null, finished_at = null where organization_id = $1 and id = $2", [input.organizationId, job.id]);
    }
    return { jobId: job.id, renderIds };
  });
}
