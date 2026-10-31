import { describe, expect, it } from "vitest";
import { createTestDb, errorOf } from "./testing";

describe("LGPD: exclusão de dados", () => {
  it("apagar a empresa remove tudo em cascata, inclusive o livro de créditos", async () => {
    const db = await createTestDb();
    try {
      const org = "10000000-0000-0000-0000-0000000000ee";
      const project = "e0000000-0000-0000-0000-000000000001";
      await db.query("insert into organizations (id, name, slug) values ($1, 'Apagar', 'apagar')", [org]);
      await db.query("insert into projects (id, organization_id, name) values ($1, $2, 'p')", [project, org]);
      await db.query("insert into credits_ledger (organization_id, delta, reason) values ($1, 5, 'grant')", [org]);
      await db.query("insert into jobs (organization_id, project_id, kind, idempotency_key) values ($1, $2, 'render', 'k')", [org, project]);
      await db.query("insert into usage_events (organization_id, kind) values ($1, 'render')", [org]);

      // diretamente, o livro continua imutável
      expect(await errorOf(() => db.query("delete from credits_ledger where organization_id = $1", [org]))).toMatch(/somente de inserção/);

      await db.query("delete from organizations where id = $1", [org]);
      for (const t of ["projects", "credits_ledger", "jobs", "usage_events"]) {
        const r = await db.query(`select count(*)::int as n from ${t} where organization_id = $1`, [org]);
        expect((r.rows[0] as { n: number }).n, t).toBe(0);
      }
    } finally {
      await db.close();
    }
  }, 60_000);
});
