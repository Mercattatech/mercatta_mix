import type { Sql } from "./sql";

export type JobKind = "upload_process" | "transcribe" | "plan" | "render" | "zip" | "publish" | "cleanup";

export interface NewJob {
  organizationId: string;
  projectId?: string | null;
  kind: JobKind;
  /** Mesma chave = mesmo job (clique duplo não duplica trabalho). */
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  priority?: number;
  refType?: string;
  refId?: string;
}

export interface JobRow {
  id: string;
  status: string;
  created: boolean;
}

/** Cria o job ou devolve o que já existe com a mesma chave. */
export async function upsertJob(sql: Sql, job: NewJob): Promise<JobRow> {
  const inserted = await sql.query<{ id: string; status: string }>(
    `insert into jobs (organization_id, project_id, kind, idempotency_key, payload, priority, ref_type, ref_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (organization_id, idempotency_key) do nothing
     returning id, status`,
    [job.organizationId, job.projectId ?? null, job.kind, job.idempotencyKey, JSON.stringify(job.payload ?? {}), job.priority ?? 0, job.refType ?? null, job.refId ?? null],
  );
  if (inserted.rows[0]) return { ...inserted.rows[0], created: true };
  const existing = await sql.query<{ id: string; status: string }>(
    "select id, status from jobs where organization_id = $1 and idempotency_key = $2",
    [job.organizationId, job.idempotencyKey],
  );
  return { ...existing.rows[0]!, created: false };
}

/** Recoloca na fila um job que falhou ou foi cancelado (nova tentativa manual). */
export async function resetJob(sql: Sql, organizationId: string, jobId: string): Promise<void> {
  await sql.query(
    `update jobs set status = 'queued', progress = 0, step_label = null, error_pt = null, finished_at = null
     where organization_id = $1 and id = $2 and status in ('failed', 'canceled')`,
    [organizationId, jobId],
  );
}

export async function markJobRunning(sql: Sql, organizationId: string, jobId: string, bossJobId?: string): Promise<void> {
  await sql.query(
    `update jobs set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()),
       boss_job_id = coalesce($3, boss_job_id), error_pt = null
     where organization_id = $1 and id = $2`,
    [organizationId, jobId, bossJobId ?? null],
  );
}

export async function setJobProgress(sql: Sql, organizationId: string, jobId: string, progress: number, label: string): Promise<void> {
  await sql.query("update jobs set progress = $3, step_label = $4 where organization_id = $1 and id = $2", [
    organizationId,
    jobId,
    Math.max(0, Math.min(100, Math.round(progress))),
    label,
  ]);
}

export async function completeJob(sql: Sql, organizationId: string, jobId: string, result: Record<string, unknown> = {}): Promise<void> {
  await sql.query(
    `update jobs set status = 'succeeded', progress = 100, step_label = 'Concluído', result = $3, finished_at = now(), error_pt = null
     where organization_id = $1 and id = $2`,
    [organizationId, jobId, JSON.stringify(result)],
  );
}

/** `final` = esgotou as tentativas. Antes disso o job volta para "na fila" (será tentado de novo). */
export async function failJob(sql: Sql, organizationId: string, jobId: string, errorPt: string, final: boolean): Promise<void> {
  await sql.query(
    `update jobs set status = $3, error_pt = $4, finished_at = case when $3 = 'failed' then now() else null end
     where organization_id = $1 and id = $2`,
    [organizationId, jobId, final ? "failed" : "queued", errorPt],
  );
}
