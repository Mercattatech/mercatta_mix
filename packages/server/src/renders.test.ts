import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@mercatta/db/testing";
import { enqueueProjectRenders } from "./renders";
import { fromPglite, type Db } from "./sql";

const ORG = "10000000-0000-0000-0000-00000000000a";
const PROJECT = "20000000-0000-0000-0000-00000000000a";
const SV = { hook: "30000000-0000-0000-0000-00000000000a", body: "40000000-0000-0000-0000-00000000000a", cta: "50000000-0000-0000-0000-00000000000a" };
const SEG = { hook: "60000000-0000-0000-0000-00000000000a", body: "70000000-0000-0000-0000-00000000000a", cta: "80000000-0000-0000-0000-00000000000a" };

let pg: PGlite;
let db: Db;

const balance = async () => Number((await pg.query<{ b: string }>("select credit_balance($1) as b", [ORG])).rows[0]!.b);
const count = async (table: string) => Number((await pg.query<{ n: number }>(`select count(*)::int as n from ${table} where organization_id = $1`, [ORG])).rows[0]!.n);

beforeAll(async () => {
  pg = await createTestDb();
  db = fromPglite(pg as never);
  await pg.query("insert into organizations (id, name, slug) values ($1, 'Empresa', 'empresa')", [ORG]);
  await pg.query("insert into projects (id, organization_id, name) values ($1, $2, 'P')", [PROJECT, ORG]);
  for (const t of ["hook", "body", "cta"] as const) {
    await pg.query("insert into source_videos (id, organization_id, project_id, type, duration_ms, status) values ($1, $2, $3, $4, 5000, 'ready')", [SV[t], ORG, PROJECT, t]);
    await pg.query("insert into segments (id, organization_id, project_id, source_video_id, type, start_word_idx, end_word_idx, start_ms, end_ms) values ($1, $2, $3, $4, $5, 0, 3, 100, 4000)", [SEG[t], ORG, PROJECT, SV[t], t]);
  }
  for (const code of ["H1_M1_C1", "H1_M1_C2", "H1_M1_C3"]) {
    await pg.query(
      "insert into combinations (organization_id, project_id, hook_segment_id, body_segment_id, cta_segment_id, code, total_duration_ms, plan_hash) values ($1, $2, $3, $4, $5, $6, 12000, $7)",
      [ORG, PROJECT, SEG.hook, SEG.body, SEG.cta, code, `hash-${code}`],
    );
  }
  await pg.query("insert into credits_ledger (organization_id, delta, reason) values ($1, 2, 'grant')", [ORG]);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("enqueueProjectRenders", () => {
  it("sem créditos suficientes não cria nada (tudo ou nada)", async () => {
    await expect(enqueueProjectRenders(db, { organizationId: ORG, projectId: PROJECT })).rejects.toThrow(/insufficient_credits/);
    expect(await count("renders")).toBe(0);
    expect(await count("jobs")).toBe(0);
    expect(await balance()).toBe(2);
    const p = await pg.query<{ status: string }>("select status from projects where id = $1", [PROJECT]);
    expect(p.rows[0]!.status).toBe("draft");
  });

  it("com créditos: reserva, cria renders e jobs; repetir não cobra de novo", async () => {
    await pg.query("insert into credits_ledger (organization_id, delta, reason) values ($1, 8, 'grant')", [ORG]);
    const first = await enqueueProjectRenders(db, { organizationId: ORG, projectId: PROJECT });
    expect(first.creditsReserved).toBe(3);
    expect(first.toPublish).toHaveLength(3);
    expect(await balance()).toBe(7);

    const again = await enqueueProjectRenders(db, { organizationId: ORG, projectId: PROJECT });
    expect(again.creditsReserved).toBe(0);
    expect(again.toPublish).toHaveLength(0);
    expect(await count("jobs")).toBe(3);
    expect(await balance()).toBe(7);
  });

  it("um render que falhou volta para a fila e é cobrado de novo só depois de devolvido", async () => {
    const r = (await pg.query<{ id: string; job_id: string }>("select r.id, j.id as job_id from renders r join jobs j on j.ref_id = r.id limit 1")).rows[0]!;
    await pg.query("update renders set status = 'failed', error_pt = 'x' where id = $1", [r.id]);
    await pg.query("update jobs set status = 'failed' where id = $1", [r.job_id]);
    await pg.query("select release_credits($1, 'render', $2)", [ORG, r.id]);
    expect(await balance()).toBe(8);

    const retry = await enqueueProjectRenders(db, { organizationId: ORG, projectId: PROJECT });
    expect(retry.toPublish.map((p) => p.renderId)).toEqual([r.id]);
    expect(retry.creditsReserved).toBe(1);
    expect(await balance()).toBe(7);
    const st = await pg.query<{ status: string; error_pt: string | null }>("select status, error_pt from renders where id = $1", [r.id]);
    expect(st.rows[0]).toEqual({ status: "queued", error_pt: null });
  });

  it("não deixa uma empresa renderizar combinações de outra", async () => {
    const other = "10000000-0000-0000-0000-00000000000b";
    await pg.query("insert into organizations (id, name, slug) values ($1, 'Outra', 'outra')", [other]);
    await expect(enqueueProjectRenders(db, { organizationId: other, projectId: PROJECT })).rejects.toThrow(/Nenhuma combinação/);
  });
});
