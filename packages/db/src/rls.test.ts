import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, errorOf } from "./testing";

// IDs fixos para facilitar a leitura dos testes
const U = {
  ownerA: "00000000-0000-0000-0000-0000000000a1",
  editorA: "00000000-0000-0000-0000-0000000000a2",
  approverA: "00000000-0000-0000-0000-0000000000a3",
  ownerB: "00000000-0000-0000-0000-0000000000b1",
  admin: "00000000-0000-0000-0000-0000000000ad",
  agency: "00000000-0000-0000-0000-0000000000ac",
  stranger: "00000000-0000-0000-0000-0000000000ff",
};
const ORG = {
  A: "10000000-0000-0000-0000-00000000000a",
  B: "10000000-0000-0000-0000-00000000000b",
  C: "10000000-0000-0000-0000-00000000000c", // empresa gerenciada pela agência
};
const ids = (org: "A" | "B") => {
  const p = org === "A" ? "a" : "b";
  const h = (n: number) => `${n}0000000-0000-0000-0000-00000000000${p}`;
  return { project: h(2), videoHook: h(3), videoBody: h(4), segHook: h(5), segBody: h(6), segCta: h(7), videoCta: h(8), combo: h(9), asset: "a0000000-0000-0000-0000-00000000000" + p };
};

let db: PGlite;

async function seedOrg(org: "A" | "B") {
  const o = ORG[org];
  const i = ids(org);
  await db.exec(`
    insert into media_assets (id, organization_id, kind, r2_key, status) values
      ('${i.asset}', '${o}', 'source', 'org/${o}/src/a.mp4', 'ready');
    insert into projects (id, organization_id, name) values ('${i.project}', '${o}', 'Projeto ${org}');
    insert into source_videos (id, organization_id, project_id, type, asset_id, duration_ms, status) values
      ('${i.videoHook}', '${o}', '${i.project}', 'hook', '${i.asset}', 5000, 'ready'),
      ('${i.videoBody}', '${o}', '${i.project}', 'body', '${i.asset}', 30000, 'ready'),
      ('${i.videoCta}',  '${o}', '${i.project}', 'cta',  '${i.asset}', 6000, 'ready');
    insert into segments (id, organization_id, project_id, source_video_id, type, start_word_idx, end_word_idx, start_ms, end_ms) values
      ('${i.segHook}', '${o}', '${i.project}', '${i.videoHook}', 'hook', 0, 5, 100, 4000),
      ('${i.segBody}', '${o}', '${i.project}', '${i.videoBody}', 'body', 0, 40, 100, 25000),
      ('${i.segCta}',  '${o}', '${i.project}', '${i.videoCta}',  'cta', 0, 8, 100, 5000);
    insert into combinations (id, organization_id, project_id, hook_segment_id, body_segment_id, cta_segment_id, code, total_duration_ms, plan_hash)
      values ('${i.combo}', '${o}', '${i.project}', '${i.segHook}', '${i.segBody}', '${i.segCta}', 'H1_M1_C1', 33000, 'hash-${org}');
    insert into renders (organization_id, project_id, combination_id, plan_hash) values ('${o}', '${i.project}', '${i.combo}', 'hash-${org}');
    insert into transcripts (organization_id, source_video_id, sha256, language, provider, model, words)
      values ('${o}', '${i.videoHook}', 'sha-${org}', 'pt', 'faster-whisper', 'small', '[]');
    insert into jobs (organization_id, project_id, kind, idempotency_key) values ('${o}', '${i.project}', 'render', 'k-${org}');
    insert into usage_events (organization_id, kind, cost_cents) values ('${o}', 'render', 1.5);
    insert into credits_ledger (organization_id, delta, reason) values ('${o}', 10, 'grant');
  `);
}

beforeAll(async () => {
  db = await createTestDb();
  for (const [k, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${k}@test.com`]);
  }
  await db.exec(`
    insert into platform_admins (user_id) values ('${U.admin}');
    insert into agencies (id, name, owner_user_id) values ('20000000-0000-0000-0000-0000000000ac', 'Agência', '${U.agency}');
    insert into organizations (id, name, slug) values ('${ORG.A}', 'Empresa A', 'empresa-a'), ('${ORG.B}', 'Empresa B', 'empresa-b');
    insert into organizations (id, name, slug, agency_id) values ('${ORG.C}', 'Empresa C', 'empresa-c', '20000000-0000-0000-0000-0000000000ac');
    insert into memberships (user_id, organization_id, role) values
      ('${U.ownerA}', '${ORG.A}', 'owner'),
      ('${U.editorA}', '${ORG.A}', 'editor'),
      ('${U.approverA}', '${ORG.A}', 'aprovador'),
      ('${U.ownerB}', '${ORG.B}', 'owner');
  `);
  await seedOrg("A");
  await seedOrg("B");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const TENANT_TABLES = [
  "media_assets", "projects", "source_videos", "transcripts", "segments", "combinations", "renders", "jobs", "credits_ledger", "memberships",
];

describe("isolamento total entre empresas", () => {
  it.each(TENANT_TABLES)("%s: usuário da empresa A não enxerga NADA da empresa B", async (table) => {
    const own = await asUser(db, U.ownerA, (q) => q(`select count(*)::int as n from ${table} where organization_id = '${ORG.A}'`));
    const other = await asUser(db, U.ownerA, (q) => q(`select count(*)::int as n from ${table} where organization_id = '${ORG.B}'`));
    expect(own[0]!.n).toBeGreaterThan(0);
    expect(other[0]!.n).toBe(0);
  });

  it.each(TENANT_TABLES)("%s: e vice-versa (empresa B não vê a A)", async (table) => {
    const other = await asUser(db, U.ownerB, (q) => q(`select count(*)::int as n from ${table} where organization_id = '${ORG.A}'`));
    expect(other[0]!.n).toBe(0);
  });

  it("usuário sem empresa não vê nada", async () => {
    for (const t of TENANT_TABLES) {
      const r = await asUser(db, U.stranger, (q) => q(`select count(*)::int as n from ${t}`));
      expect(r[0]!.n, t).toBe(0);
    }
  });

  it("anon não tem acesso nem para ler", async () => {
    const err = await errorOf(() => asUser(db, null, (q) => q("select * from projects"), "anon"));
    expect(err).toMatch(/permission denied/);
  });

  it("não é possível criar projeto na empresa de outro", async () => {
    const err = await errorOf(() =>
      asUser(db, U.ownerA, (q) => q("insert into projects (organization_id, name, created_by) values ($1, 'invasão', $2)", [ORG.B, U.ownerA])),
    );
    expect(err).toMatch(/row-level security/);
  });

  it("não é possível alterar nem apagar dados de outra empresa (0 linhas afetadas)", async () => {
    const r = await asUser(db, U.ownerA, async (q) => {
      await q("update projects set name = 'hack' where organization_id = $1", [ORG.B]);
      await q("delete from segments where organization_id = $1", [ORG.B]);
      return q("select count(*)::int as n from projects where name = 'hack'");
    });
    expect(r[0]!.n).toBe(0);
    const still = await db.query("select count(*)::int as n from segments where organization_id = $1", [ORG.B]);
    expect((still.rows[0] as { n: number }).n).toBe(3);
  });
});

describe("papéis: owner, editor, aprovador", () => {
  const newProject = (uid: string) => (q: Parameters<Parameters<typeof asUser>[2]>[0]) =>
    q("insert into projects (organization_id, name, created_by) values ($1, 'novo', $2) returning id", [ORG.A, uid]);

  it("editor cria projeto", async () => {
    expect((await asUser(db, U.editorA, newProject(U.editorA))).length).toBe(1);
  });

  it("aprovador NÃO cria projeto, mas lê", async () => {
    expect(await errorOf(() => asUser(db, U.approverA, newProject(U.approverA)))).toMatch(/row-level security/);
    const r = await asUser(db, U.approverA, (q) => q("select count(*)::int as n from projects"));
    expect(r[0]!.n).toBe(1);
  });

  it("não dá para criar projeto em nome de outra pessoa", async () => {
    expect(await errorOf(() => asUser(db, U.editorA, newProject(U.ownerA)))).toMatch(/row-level security/);
  });

  it("aprovador não edita trechos; editor edita", async () => {
    const upd = (q: Parameters<Parameters<typeof asUser>[2]>[0]) => q("update segments set label = 'x' where id = $1 returning id", [ids("A").segHook]);
    expect((await asUser(db, U.approverA, upd)).length).toBe(0);
    expect((await asUser(db, U.editorA, upd)).length).toBe(1);
  });

  it("editor não gerencia a equipe; owner sim", async () => {
    const add = (q: Parameters<Parameters<typeof asUser>[2]>[0]) =>
      q("insert into invitations (organization_id, email, role, token_hash) values ($1, 'x@x.com', 'editor', 'h') returning id", [ORG.A]);
    expect(await errorOf(() => asUser(db, U.editorA, add))).toMatch(/row-level security/);
    expect((await asUser(db, U.ownerA, add)).length).toBe(1);
  });

  it("ninguém muda o próprio papel (escalada de privilégio)", async () => {
    const r = await asUser(db, U.editorA, (q) => q("update memberships set role = 'owner' where user_id = $1 returning id", [U.editorA]));
    expect(r.length).toBe(0);
    // nem o owner muda o próprio
    const r2 = await asUser(db, U.ownerA, (q) => q("update memberships set role = 'editor' where user_id = $1 returning id", [U.ownerA]));
    expect(r2.length).toBe(0);
  });

  it("owner altera o papel de outro membro", async () => {
    const r = await asUser(db, U.ownerA, (q) => q("update memberships set role = 'aprovador' where user_id = $1 returning id", [U.editorA]));
    expect(r.length).toBe(1);
  });

  it("limite de 3 usuários por empresa", async () => {
    await db.query("insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f4', 'quarto@test.com')");
    const err = await errorOf(() =>
      db.query("insert into memberships (user_id, organization_id, role) values ('00000000-0000-0000-0000-0000000000f4', $1, 'editor')", [ORG.A]),
    );
    expect(err).toMatch(/member_limit_reached/);
    await db.query("delete from auth.users where id = '00000000-0000-0000-0000-0000000000f4'");
  });

  it("não remove o último owner", async () => {
    const err = await errorOf(() => db.query("delete from memberships where user_id = $1", [U.ownerB]));
    expect(err).toMatch(/last_owner/);
  });

  it("usuário vê só colegas da própria empresa", async () => {
    const r = await asUser(db, U.editorA, (q) => q("select id from users order by email"));
    const seen = r.map((x) => x.id);
    expect(seen).toContain(U.ownerA);
    expect(seen).toContain(U.approverA);
    expect(seen).not.toContain(U.ownerB);
  });
});

describe("escritas que só o servidor faz", () => {
  it.each([
    ["jobs", `insert into jobs (organization_id, kind, idempotency_key) values ('${ORG.A}', 'render', 'hack')`],
    ["renders", `insert into renders (organization_id, project_id, combination_id, plan_hash) values ('${ORG.A}', '${ids("A").project}', '${ids("A").combo}', 'x')`],
    ["transcripts", `update transcripts set full_text = 'x'`],
    ["media_assets", `insert into media_assets (organization_id, kind, r2_key) values ('${ORG.A}', 'source', 'org/${ORG.A}/x')`],
    ["credits_ledger", `insert into credits_ledger (organization_id, delta, reason) values ('${ORG.A}', 999, 'grant')`],
    ["organizations", `insert into organizations (name, slug) values ('x', 'xx')`],
    ["combinations", `insert into combinations (organization_id, project_id, hook_segment_id, body_segment_id, cta_segment_id, code, total_duration_ms, plan_hash) values ('${ORG.A}', '${ids("A").project}', '${ids("A").segHook}', '${ids("A").segBody}', '${ids("A").segCta}', 'X', 1, 'h')`],
  ])("%s: cliente não escreve direto", async (_t, sql) => {
    const err = await errorOf(() => asUser(db, U.ownerA, (q) => q(sql)));
    expect(err).toMatch(/permission denied|row-level security/);
  });

  it("owner não pode editar colunas sensíveis da empresa (slug, status)", async () => {
    expect(await errorOf(() => asUser(db, U.ownerA, (q) => q("update organizations set slug = 'novo-slug' where id = $1", [ORG.A])))).toMatch(/permission denied/);
    expect((await asUser(db, U.ownerA, (q) => q("update organizations set name = 'Novo nome' where id = $1 returning id", [ORG.A]))).length).toBe(1);
  });

  it("usage_events (custo interno) só o admin da plataforma enxerga", async () => {
    expect((await asUser(db, U.ownerA, (q) => q("select * from usage_events"))).length).toBe(0);
    expect((await asUser(db, U.admin, (q) => q("select * from usage_events"))).length).toBe(2);
  });

  it("platform_admins não é legível pelo cliente", async () => {
    expect(await errorOf(() => asUser(db, U.admin, (q) => q("select * from platform_admins")))).toMatch(/permission denied/);
  });
});

describe("integridade entre empresas e tipos (no banco)", () => {
  it("vídeo da empresa B não pode apontar para projeto da empresa A", async () => {
    const err = await errorOf(() =>
      db.query("insert into source_videos (organization_id, project_id, type) values ($1, $2, 'hook')", [ORG.B, ids("A").project]),
    );
    expect(err).toMatch(/foreign key/);
  });

  it("combinação não referencia trecho de outra empresa", async () => {
    const err = await errorOf(() =>
      db.query(
        "insert into combinations (organization_id, project_id, hook_segment_id, body_segment_id, cta_segment_id, code, total_duration_ms, plan_hash) values ($1,$2,$3,$4,$5,'X9',1,'h')",
        [ORG.A, ids("A").project, ids("B").segHook, ids("A").segBody, ids("A").segCta],
      ),
    );
    expect(err).toMatch(/foreign key/);
  });

  it("trecho 'gancho' não pode vir de um vídeo do tipo miolo", async () => {
    const err = await errorOf(() =>
      db.query(
        "insert into segments (organization_id, project_id, source_video_id, type, start_word_idx, end_word_idx, start_ms, end_ms) values ($1,$2,$3,'hook',0,1,0,1000)",
        [ORG.A, ids("A").project, ids("A").videoBody],
      ),
    );
    expect(err).toMatch(/foreign key/);
  });

  it("combinação não aceita miolo no lugar de gancho", async () => {
    const err = await errorOf(() =>
      db.query(
        "insert into combinations (organization_id, project_id, hook_segment_id, body_segment_id, cta_segment_id, code, total_duration_ms, plan_hash) values ($1,$2,$3,$4,$5,'X8',1,'h')",
        [ORG.A, ids("A").project, ids("A").segBody, ids("A").segBody, ids("A").segCta],
      ),
    );
    expect(err).toMatch(/foreign key/);
  });

  it("código de combinação é único por projeto", async () => {
    const err = await errorOf(() =>
      db.query(
        "insert into combinations (organization_id, project_id, hook_segment_id, body_segment_id, cta_segment_id, code, total_duration_ms, plan_hash) values ($1,$2,$3,$4,$5,'H1_M1_C1',1,'h')",
        [ORG.A, ids("A").project, ids("A").segHook, ids("A").segBody, ids("A").segCta],
      ),
    );
    expect(err).toMatch(/unique|duplicate/);
  });

  it("um render por (combinação, plano): mesmo plano não duplica", async () => {
    const err = await errorOf(() =>
      db.query("insert into renders (organization_id, project_id, combination_id, plan_hash) values ($1,$2,$3,'hash-A')", [ORG.A, ids("A").project, ids("A").combo]),
    );
    expect(err).toMatch(/unique|duplicate/);
  });

  it("jobs: mesma chave de idempotência na mesma empresa não duplica", async () => {
    const err = await errorOf(() => db.query("insert into jobs (organization_id, kind, idempotency_key) values ($1, 'render', 'k-A')", [ORG.A]));
    expect(err).toMatch(/unique|duplicate/);
  });

  it("a chave do storage precisa começar com org/{organization_id}/", async () => {
    const err = await errorOf(() =>
      db.query("insert into media_assets (organization_id, kind, r2_key) values ($1, 'source', $2)", [ORG.A, `org/${ORG.B}/roubo.mp4`]),
    );
    expect(err).toMatch(/check/);
  });

  it("apagar o projeto apaga vídeos, trechos, combinações e renders (cascata)", async () => {
    const tmpOrg = "10000000-0000-0000-0000-0000000000dd";
    await db.query("insert into organizations (id, name, slug) values ($1, 'Tmp', 'tmp-org')", [tmpOrg]);
    const p = "d0000000-0000-0000-0000-000000000001";
    await db.query("insert into projects (id, organization_id, name) values ($1, $2, 'p')", [p, tmpOrg]);
    await db.query("insert into source_videos (id, organization_id, project_id, type) values ('d0000000-0000-0000-0000-000000000002', $1, $2, 'hook')", [tmpOrg, p]);
    await db.query("delete from projects where id = $1", [p]);
    const r = await db.query("select count(*)::int as n from source_videos where organization_id = $1", [tmpOrg]);
    expect((r.rows[0] as { n: number }).n).toBe(0);
    await db.query("delete from organizations where id = $1", [tmpOrg]);
  });
});

describe("administração e agência", () => {
  it("admin da plataforma vê as duas empresas", async () => {
    const r = await asUser(db, U.admin, (q) => q("select distinct organization_id from projects order by 1"));
    expect(r.map((x) => x.organization_id)).toEqual([ORG.A, ORG.B]);
  });

  it("dono da agência-mãe enxerga e edita a empresa gerenciada, mas não as outras", async () => {
    const orgs = await asUser(db, U.agency, (q) => q("select id from organizations"));
    expect(orgs.map((o) => o.id)).toEqual([ORG.C]);
    const ins = await asUser(db, U.agency, (q) =>
      q("insert into projects (organization_id, name, created_by) values ($1, 'da agência', $2) returning id", [ORG.C, U.agency]),
    );
    expect(ins.length).toBe(1);
    expect(await errorOf(() => asUser(db, U.agency, (q) => q("insert into projects (organization_id, name, created_by) values ($1, 'x', $2)", [ORG.A, U.agency])))).toMatch(
      /row-level security/,
    );
  });
});

describe("créditos", () => {
  const ref = "c0000000-0000-0000-0000-000000000001";
  const bal = async (org = ORG.A) => Number(((await db.query("select credit_balance($1) as b", [org])).rows[0] as { b: unknown }).b);

  it("saldo = soma do livro", async () => {
    expect(await bal()).toBe(10);
  });

  it("reserva, confirma e é idempotente", async () => {
    await db.query("select reserve_credits($1, 3, 'render_batch', $2)", [ORG.A, ref]);
    await db.query("select reserve_credits($1, 3, 'render_batch', $2)", [ORG.A, ref]); // repetido: não cobra de novo
    expect(await bal()).toBe(7);
    await db.query("select commit_credits($1, 'render_batch', $2)", [ORG.A, ref]);
    await db.query("select release_credits($1, 'render_batch', $2)", [ORG.A, ref]); // já confirmado: não devolve
    expect(await bal()).toBe(7);
  });

  it("falha devolve a reserva (release) uma vez só", async () => {
    const r2 = "c0000000-0000-0000-0000-000000000002";
    await db.query("select reserve_credits($1, 4, 'render_batch', $2)", [ORG.A, r2]);
    expect(await bal()).toBe(3);
    await db.query("select release_credits($1, 'render_batch', $2)", [ORG.A, r2]);
    await db.query("select release_credits($1, 'render_batch', $2)", [ORG.A, r2]);
    expect(await bal()).toBe(7);
  });

  it("não reserva além do saldo", async () => {
    const err = await errorOf(() => db.query("select reserve_credits($1, 1000, 'render_batch', 'c0000000-0000-0000-0000-000000000003')", [ORG.A]));
    expect(err).toMatch(/insufficient_credits/);
    expect(await bal()).toBe(7);
  });

  it("não confirma sem reserva", async () => {
    const err = await errorOf(() => db.query("select commit_credits($1, 'render_batch', 'c0000000-0000-0000-0000-0000000000ee')", [ORG.A]));
    expect(err).toMatch(/no_reservation/);
  });

  it("livro é imutável", async () => {
    expect(await errorOf(() => db.query("update credits_ledger set delta = 1000"))).toMatch(/somente de inserção/);
    expect(await errorOf(() => db.query("delete from credits_ledger"))).toMatch(/somente de inserção/);
  });

  it("cliente não chama funções de reserva, mas lê o próprio saldo", async () => {
    expect(await errorOf(() => asUser(db, U.ownerA, (q) => q("select reserve_credits($1, 1, 'x', gen_random_uuid())", [ORG.A])))).toMatch(/permission denied/);
    const own = await asUser(db, U.ownerA, (q) => q("select my_credit_balance($1) as b", [ORG.A]));
    expect(Number(own[0]!.b)).toBe(7);
    expect(await errorOf(() => asUser(db, U.ownerA, (q) => q("select my_credit_balance($1)", [ORG.B])))).toMatch(/forbidden/);
  });
});
