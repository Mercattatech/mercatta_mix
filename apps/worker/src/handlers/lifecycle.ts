import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import {
  completeJob,
  failJob,
  markJobRunning,
  setJobProgress,
  toFriendlyError,
  UserFacingError,
  type JobContext,
  type Sql,
} from "@mercatta/server";
import { logger, type WorkerDeps } from "../deps";

export type ProgressFn = (percent: number, label: string) => Promise<void>;

export interface TrackedJobOptions {
  organizationId: string;
  jobId: string;
  ctx: JobContext;
  /** Roda quando o job desiste de vez (erro permanente ou tentativas esgotadas): devolve créditos, marca o item como falho etc. */
  onFinalFailure?: (sql: Sql, friendlyMessage: string) => Promise<void>;
}

export interface JobEnv {
  workDir: string;
  progress: ProgressFn;
}

/**
 * Executa um job com o ciclo de vida completo no banco (running → succeeded/failed) e uma pasta temporária própria.
 *
 *  - erro de usuário (UserFacingError, ex.: vídeo longo demais) é PERMANENTE: não adianta tentar de novo;
 *  - erro técnico é tentado de novo (pg-boss) até esgotar; só na última tentativa o job vira "failed".
 */
export async function runTrackedJob(
  deps: WorkerDeps,
  opts: TrackedJobOptions,
  fn: (env: JobEnv) => Promise<Record<string, unknown>>,
): Promise<void> {
  const log = logger(deps);
  const { organizationId, jobId, ctx } = opts;
  await mkdir(deps.tmpRoot, { recursive: true });
  const workDir = await mkdtemp(path.join(deps.tmpRoot, "job-"));
  try {
    await markJobRunning(deps.db, organizationId, jobId, ctx.bossJobId);
    const progress: ProgressFn = (p, label) => setJobProgress(deps.db, organizationId, jobId, p, label);
    const result = await fn({ workDir, progress });
    await completeJob(deps.db, organizationId, jobId, result);
  } catch (e) {
    const message = toFriendlyError(e);
    const permanent = e instanceof UserFacingError;
    const final = permanent || ctx.isFinalAttempt;
    log("job.error", { jobId, final, error: e instanceof Error ? e.message : String(e), stderr: (e as { stderr?: string }).stderr?.slice(-500) });
    await failJob(deps.db, organizationId, jobId, message, final);
    if (final) {
      await opts.onFinalFailure?.(deps.db, message).catch((err) => log("job.onFinalFailure.error", { jobId, error: String(err) }));
      return; // não relança: tentar de novo não resolve
    }
    throw e; // pg-boss agenda a nova tentativa
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
