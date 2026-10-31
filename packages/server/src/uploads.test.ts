import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@mercatta/db/testing";
import { createSegment, createSourceVideo, finishUpload, prepareZip } from "./uploads";
import { fromPglite, type Db } from "./sql";

const ORG = "10000000-0000-0000-0000-00000000000a";
const OTHER = "10000000-0000-0000-0000-00000000000b";
let pg: PGlite;
let db: Db;
let projectId: string;

const words = [
  { w: "oi", start_ms: 500, end_ms: 900 },
  { w: "gente", start_ms: 1000, end_ms: 1500 },
  { w: "tudo", start_ms: 1600, end_ms: 1900 },
];

beforeAll(async () => {
  pg = await createTestDb();
  db = fromPglite(pg as never);
  await pg.query("insert into organizations (id, name, slug) values ($1, 'A', 'empresa-a'), ($2, 'B', 'empresa-b')", [ORG, OTHER]);
  projectId = (await pg.query<{ id: string }>("insert into projects (organization_id, name) values ($1, 'P') returning id", [ORG])).rows[0]!.id;
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("createSourceVideo", () => {
  it("aceita mp4/mov/mkv e grava a chave dentro da pasta da empresa", async () => {
    const r = await createSourceVideo(db, { organizationId: ORG, projectId, type: "hook", filename: "Meu Gancho.MOV", sizeBytes: 1000 });
    expect(r.key).toBe(`org/${ORG}/src/${r.sourceVideoId}.mov`);
    const row = (await pg.query<{ status: string; asset_id: string }>("select status, asset_id from source_videos where id = $1", [r.sourceVideoId])).rows[0]!;
    expect(row.status).toBe("uploading");
    expect(row.asset_id).toBeTruthy();
  });

  it("recusa formato, tamanho e arquivo vazio com mensagem em português", async () => {
    await expect(createSourceVideo(db, { organizationId: ORG, projectId, type: "hook", filename: "x.avi", sizeBytes: 10 })).rejects.toThrow(/MP4, MOV ou MKV/);
    await expect(createSourceVideo(db, { organizationId: ORG, projectId, type: "hook", filename: "x.mp4", sizeBytes: 6 * 1024 ** 3 })).rejects.toThrow(/5 GB/);
    await expect(createSourceVideo(db, { organizationId: ORG, projectId, type: "hook", filename: "x.mp4", sizeBytes: 0 })).rejects.toThrow(/vazio/);
  });

  it("não cria vídeo em projeto de outra empresa", async () => {
    await expect(createSourceVideo(db, { organizationId: OTHER, projectId, type: "hook", filename: "x.mp4", sizeBytes: 10 })).rejects.toThrow(/Projeto não encontrado/);
  });
});

describe("finishUpload", () => {
  it("é idempotente: terminar duas vezes cria um único job", async () => {
    const v = await createSourceVideo(db, { organizationId: ORG, projectId, type: "body", filename: "m.mp4", sizeBytes: 10 });
    const a = await finishUpload(db, { organizationId: ORG, sourceVideoId: v.sourceVideoId });
    const b = await finishUpload(db, { organizationId: ORG, sourceVideoId: v.sourceVideoId });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.jobId).toBe(a.jobId);
    const st = await pg.query<{ status: string }>("select status from source_videos where id = $1", [v.sourceVideoId]);
    expect(st.rows[0]!.status).toBe("uploaded");
  });

  it("depois de falhar, terminar de novo recoloca o job na fila", async () => {
    const v = await createSourceVideo(db, { organizationId: ORG, projectId, type: "cta", filename: "c.mp4", sizeBytes: 10 });
    const a = await finishUpload(db, { organizationId: ORG, sourceVideoId: v.sourceVideoId });
    await pg.query("update jobs set status = 'failed', error_pt = 'x' where id = $1", [a.jobId]);
    await pg.query("update source_videos set status = 'failed' where id = $1", [v.sourceVideoId]);
    const again = await finishUpload(db, { organizationId: ORG, sourceVideoId: v.sourceVideoId });
    expect(again.jobId).toBe(a.jobId);
    expect(again.created).toBe(true);
    const j = await pg.query<{ status: string; error_pt: string | null }>("select status, error_pt from jobs where id = $1", [a.jobId]);
    expect(j.rows[0]).toEqual({ status: "queued", error_pt: null });
  });
});

describe("createSegment", () => {
  let svId: string;
  beforeAll(async () => {
    const v = await createSourceVideo(db, { organizationId: ORG, projectId, type: "hook", filename: "g.mp4", sizeBytes: 10 });
    svId = v.sourceVideoId;
    await pg.query("insert into transcripts (organization_id, source_video_id, sha256, language, provider, model, words) values ($1, $2, 's', 'pt', 'p', 'm', $3)", [ORG, svId, JSON.stringify(words)]);
  });

  it("tira o tempo das palavras e o tipo do vídeo", async () => {
    const s = await createSegment(db, { organizationId: ORG, projectId, sourceVideoId: svId, startWordIdx: 0, endWordIdx: 1, label: "Abertura" });
    expect(s).toMatchObject({ startMs: 500, endMs: 1500 });
    const row = (await pg.query<{ type: string; sort_order: number }>("select type, sort_order from segments where id = $1", [s.id])).rows[0]!;
    expect(row.type).toBe("hook");
    const s2 = await createSegment(db, { organizationId: ORG, projectId, sourceVideoId: svId, startWordIdx: 2, endWordIdx: 2 });
    const row2 = (await pg.query<{ sort_order: number }>("select sort_order from segments where id = $1", [s2.id])).rows[0]!;
    expect(row2.sort_order).toBe(row.sort_order + 1);
  });

  it("recusa intervalos inválidos", async () => {
    for (const [a, b] of [[-1, 1], [2, 1], [0, 3], [0.5, 1]] as const) {
      await expect(createSegment(db, { organizationId: ORG, projectId, sourceVideoId: svId, startWordIdx: a, endWordIdx: b })).rejects.toThrow(/inválida/);
    }
  });

  it("recusa vídeo sem transcrição e vídeo de outra empresa", async () => {
    const v = await createSourceVideo(db, { organizationId: ORG, projectId, type: "hook", filename: "n.mp4", sizeBytes: 10 });
    await expect(createSegment(db, { organizationId: ORG, projectId, sourceVideoId: v.sourceVideoId, startWordIdx: 0, endWordIdx: 0 })).rejects.toThrow(/transcrito/);
    await expect(createSegment(db, { organizationId: OTHER, projectId, sourceVideoId: svId, startWordIdx: 0, endWordIdx: 0 })).rejects.toThrow(/não encontrado/);
  });
});

describe("prepareZip", () => {
  it("sem vídeos prontos, avisa", async () => {
    await expect(prepareZip(db, { organizationId: ORG, projectId })).rejects.toThrow(/Nenhum vídeo pronto/);
  });
});
