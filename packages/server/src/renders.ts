import { jobIdempotencyKey } from "@mercatta/core";
import { upsertJob, resetJob } from "./jobs";
import { UserFacingError } from "./errors";
import type { Db, Sql } from "./sql";

export interface EnqueueRendersInput {
  organizationId: string;
  projectId: string;
  /** Limita a estas combinações. Padrão: todas as marcadas (selected). */
  combinationIds?: string[];
  /** Prioridade do plano (maior = antes). */
  priority?: number;
}

export interface EnqueuedRender {
  renderId: string;
  jobId: string;
  code: string;
  planHash: string;
  /** false = já estava pronto ou na fila com este plano: nada novo a fazer. */
  needsWork: boolean;
}

export interface EnqueueRendersResult {
  renders: EnqueuedRender[];
  /** Jobs que precisam ser publicados na fila (feito depois do commit da transação). */
  toPublish: { jobId: string; renderId: string; priority: number }[];
  creditsReserved: number;
}

/** Quanto custa renderizar 1 vídeo (créditos), conforme platform_settings.credit_costs. */
export async function getRenderCreditCost(sql: Sql): Promise<number> {
  const r = await sql.query<{ value: { per_render?: number } }>("select value from platform_settings where key = 'credit_costs'");
  return r.rows[0]?.value?.per_render ?? 1;
}

/**
 * Cria os renders das combinações selecionadas, reserva os créditos e cria os jobs — tudo numa transação:
 * se faltar crédito, nada é criado. Um render que já existe com o MESMO plano é reaproveitado (não cobra de novo).
 */
export async function enqueueProjectRenders(db: Db, input: EnqueueRendersInput): Promise<EnqueueRendersResult> {
  const { organizationId, projectId } = input;
  return db.transaction(async (tx) => {
    const combos = (
      await tx.query<{ id: string; code: string; plan_hash: string }>(
        `select id, code, plan_hash from combinations
          where organization_id = $1 and project_id = $2 and selected
            and ($3::uuid[] is null or id = any($3::uuid[]))
          order by code`,
        [organizationId, projectId, input.combinationIds ?? null],
      )
    ).rows;
    if (combos.length === 0) throw new UserFacingError("Nenhuma combinação selecionada para renderizar.");

    const perRender = await getRenderCreditCost(tx);
    const priority = input.priority ?? 0;
    const renders: EnqueuedRender[] = [];
    const toPublish: EnqueueRendersResult["toPublish"] = [];
    let reserved = 0;

    for (const c of combos) {
      await tx.query(
        `insert into renders (organization_id, project_id, combination_id, plan_hash)
         values ($1, $2, $3, $4) on conflict (combination_id, plan_hash) do nothing`,
        [organizationId, projectId, c.id, c.plan_hash],
      );
      const render = (
        await tx.query<{ id: string; status: string }>(
          "select id, status from renders where organization_id = $1 and combination_id = $2 and plan_hash = $3",
          [organizationId, c.id, c.plan_hash],
        )
      ).rows[0]!;

      const job = await upsertJob(tx, {
        organizationId,
        projectId,
        kind: "render",
        idempotencyKey: jobIdempotencyKey("render", { renderId: render.id, planHash: c.plan_hash }),
        payload: { renderId: render.id },
        priority,
        refType: "render",
        refId: render.id,
      });

      const retry = render.status === "failed" || render.status === "canceled";
      const needsWork = job.created || retry;
      if (retry) {
        await tx.query("update renders set status = 'queued', error_pt = null, finished_at = null where organization_id = $1 and id = $2", [organizationId, render.id]);
        await resetJob(tx, organizationId, job.id);
      }
      if (needsWork) {
        // idempotente: se já houver reserva ativa para este render, não cobra de novo
        await tx.query("select public.reserve_credits($1, $2, 'render', $3)", [organizationId, perRender, render.id]);
        reserved += perRender;
        toPublish.push({ jobId: job.id, renderId: render.id, priority });
      }
      renders.push({ renderId: render.id, jobId: job.id, code: c.code, planHash: c.plan_hash, needsWork });
    }

    await tx.query("update projects set status = 'rendering' where organization_id = $1 and id = $2 and status <> 'archived'", [organizationId, projectId]);
    return { renders, toPublish, creditsReserved: reserved };
  });
}
