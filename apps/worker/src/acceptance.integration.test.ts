import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAss, buildTimeline, computeCut, DEFAULT_CAPTION_STYLE, parseAssDialogues, type CaptionWord } from "@mercatta/core";
import { createTestDb } from "@mercatta/db/testing";
import { enqueueProjectRenders, fromPglite, generateProjectCombinations, loadRenderContext, upsertJob, type Db, type JobContext } from "@mercatta/server";
import type { WorkerDeps } from "./deps";
import { renderCombination } from "./handlers/render";
import { processSource } from "./handlers/process-source";
import { buildZip } from "./handlers/zip";
import { energyEnvelope, hasAssFilter, probe, renderVariation } from "./media";
import { LocalObjectStore, type ObjectStore } from "./store";
import { BeepTranscriber, decodeMono, detectBeeps, makeBeepVideo, maxStepIn, type BeepSpec } from "./testing/beep";

/**
 * Critério de aceite da Fase 1, de ponta a ponta com FFmpeg real:
 * 3 ganchos × 2 miolos × 2 CTAs → 12 MP4 de 1080×1920, cada um com até 60 s, sem estalo nas emendas,
 * legenda sincronizada (erro < 150 ms) e nomeados H1_M1_C1 etc., mais o ZIP.
 *
 * Os vídeos são sintéticos: cada "palavra" é um bipe de tempo conhecido. O BeepTranscriber mede os bipes no áudio;
 * depois o teste mede os bipes no MP4 FINAL (outro medidor) e compara com a linha do tempo/legenda gravadas.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tmp");
const ORG = "10000000-0000-0000-0000-00000000000a";
const USER = "00000000-0000-0000-0000-0000000000a1";
const CTX: JobContext = { bossJobId: "test", retryCount: 0, isFinalAttempt: true };

let dir: string;
let pg: PGlite;
let db: Db;
let store: ObjectStore;
let deps: WorkerDeps;
let transcriber: BeepTranscriber;
let projectId: string;
let libass = false;

const HOOKS: { freq: number; beeps: BeepSpec[]; seconds: number }[] = [
  { freq: 400, seconds: 5, beeps: [{ startS: 0.6, endS: 1.0 }, { startS: 1.8, endS: 2.3 }] },
  { freq: 450, seconds: 5, beeps: [{ startS: 0.5, endS: 1.1 }, { startS: 2.0, endS: 2.4 }, { startS: 3.0, endS: 3.3 }] },
  { freq: 500, seconds: 4, beeps: [{ startS: 0.7, endS: 1.2 }, { startS: 2.1, endS: 2.7 }] },
];
const BODIES: typeof HOOKS = [
  { freq: 700, seconds: 8, beeps: [{ startS: 0.5, endS: 1.2 }, { startS: 2.5, endS: 3.0 }, { startS: 4.5, endS: 5.2 }, { startS: 6.2, endS: 6.8 }] },
  { freq: 760, seconds: 7, beeps: [{ startS: 0.6, endS: 1.3 }, { startS: 2.7, endS: 3.4 }, { startS: 4.8, endS: 5.3 }] },
];
const CTAS: typeof HOOKS = [
  { freq: 1000, seconds: 5, beeps: [{ startS: 0.7, endS: 1.3 }, { startS: 2.6, endS: 3.2 }] },
  { freq: 1100, seconds: 4, beeps: [{ startS: 0.6, endS: 1.2 }, { startS: 2.4, endS: 3.0 }] },
];

async function addSource(project: string, type: "hook" | "body" | "cta", sortOrder: number, file: string) {
  const id = randomUUID();
  const key = `org/${ORG}/src/${id}.mp4`;
  const { sizeBytes } = await store.upload(file, key, "video/mp4");
  const asset = (
    await pg.query<{ id: string }>("insert into media_assets (organization_id, kind, r2_key, size_bytes, status) values ($1, 'source', $2, $3, 'pending') returning id", [ORG, key, sizeBytes])
  ).rows[0]!;
  await pg.query(
    "insert into source_videos (id, organization_id, project_id, type, original_filename, asset_id, status, sort_order) values ($1, $2, $3, $4, $5, $6, 'uploaded', $7)",
    [id, ORG, project, type, `${type}${sortOrder}.mp4`, asset.id, sortOrder],
  );
  const job = await upsertJob(db, { organizationId: ORG, projectId: project, kind: "upload_process", idempotencyKey: `proc:${id}`, refType: "source_video", refId: id });
  return { id, jobId: job.id };
}

async function runProcess(s: { id: string; jobId: string }) {
  await processSource(deps, { organizationId: ORG, jobId: s.jobId, sourceVideoId: s.id, language: "pt" }, CTX);
}

async function balance(): Promise<number> {
  return Number((await pg.query<{ b: string }>("select credit_balance($1) as b", [ORG])).rows[0]!.b);
}

/** Lê os nomes e tamanhos do diretório central de um ZIP (sem depender de unzip). */
function listZip(buf: Buffer): { name: string; size: number }[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP inválido: sem diretório central");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { name: string; size: number }[] = [];
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP inválido: entrada corrompida");
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    out.push({ name: buf.subarray(p + 46, p + 46 + nameLen).toString("utf8"), size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

beforeAll(async () => {
  await mkdir(ROOT, { recursive: true });
  dir = await mkdtemp(path.join(ROOT, "e2e-"));
  libass = await hasAssFilter();
  pg = await createTestDb();
  db = fromPglite(pg as never);
  store = new LocalObjectStore(path.join(dir, "storage"));
  transcriber = new BeepTranscriber();
  deps = { db, store, transcriber, tmpRoot: path.join(dir, "work"), burnCaptions: libass, log: () => undefined };

  await pg.query("insert into users (id, email) values ($1, 'dono@teste.com')", [USER]);
  await pg.query("insert into organizations (id, name, slug) values ($1, 'Locadora Teste', 'locadora-teste')", [ORG]);
  await pg.query("insert into memberships (user_id, organization_id, role) values ($1, $2, 'owner')", [USER, ORG]);
  await pg.query("insert into credits_ledger (organization_id, delta, reason) values ($1, 100, 'grant')", [ORG]);
  projectId = (await pg.query<{ id: string }>("insert into projects (organization_id, name, target_networks, created_by) values ($1, 'Piloto', array['instagram'], $2) returning id", [ORG, USER])).rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await pg?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("Fase 1 — de 7 vídeos a 12 Reels", () => {
  const sources: { id: string; jobId: string; type: "hook" | "body" | "cta" }[] = [];
  let renderIds: { renderId: string; jobId: string; code: string }[] = [];

  it("sobe e processa 3 ganchos, 2 miolos e 2 CTAs (pré-processamento + transcrição)", async () => {
    const groups = [
      ["hook", HOOKS],
      ["body", BODIES],
      ["cta", CTAS],
    ] as const;
    for (const [type, specs] of groups) {
      for (const [i, spec] of specs.entries()) {
        const file = path.join(dir, `${type}${i + 1}.mp4`);
        await makeBeepVideo(file, spec);
        const s = await addSource(projectId, type, i, file);
        sources.push({ ...s, type });
        await runProcess(s);
      }
    }

    const rows = (await pg.query<{ id: string; status: string; width: number; height: number; fps: string; type: string }>("select id, status, width, height, fps, type from source_videos where project_id = $1", [projectId])).rows;
    expect(rows).toHaveLength(7);
    for (const r of rows) {
      expect(r.status).toBe("ready");
      expect([r.width, r.height]).toEqual([1080, 1920]);
      expect(Number(r.fps)).toBeCloseTo(30, 2);
    }
    const jobs = (await pg.query<{ status: string }>("select status from jobs where project_id = $1", [projectId])).rows;
    expect(jobs.every((j) => j.status === "succeeded")).toBe(true);

    // uma palavra por bipe
    const all = [...HOOKS, ...BODIES, ...CTAS];
    for (const [i, s] of sources.entries()) {
      const t = (await pg.query<{ words: unknown[] }>("select words from transcripts where source_video_id = $1", [s.id])).rows[0]!;
      expect(t.words).toHaveLength(all[i]!.beeps.length);
    }
  }, 300_000);

  it("gera as 12 combinações sem estourar o limite de duração", async () => {
    // um trecho por vídeo, cobrindo todas as palavras
    for (const [i, s] of sources.entries()) {
      const t = (await pg.query<{ words: { start_ms: number; end_ms: number }[] }>("select words from transcripts where source_video_id = $1", [s.id])).rows[0]!;
      const first = t.words[0]!;
      const last = t.words[t.words.length - 1]!;
      await pg.query(
        "insert into segments (organization_id, project_id, source_video_id, type, start_word_idx, end_word_idx, start_ms, end_ms, sort_order) values ($1, $2, $3, $4, 0, $5, $6, $7, $8)",
        [ORG, projectId, s.id, s.type, t.words.length - 1, first.start_ms, last.end_ms, i],
      );
    }
    const res = await generateProjectCombinations(db, { organizationId: ORG, projectId });
    expect(res.fullCount).toBe(12);
    expect(res.generated).toBe(12);
    expect(res.violations).toEqual([]);
    const expected = ["H1", "H2", "H3"].flatMap((h) => ["M1", "M2"].flatMap((m) => ["C1", "C2"].map((c) => `${h}_${m}_${c}`)));
    expect(res.combinations.map((c) => c.code).sort()).toEqual(expected.sort());
    for (const c of res.combinations) expect(c.totalDurationMs).toBeLessThanOrEqual(60_000);
  }, 60_000);

  it("reserva 12 créditos de uma vez e é idempotente", async () => {
    const first = await enqueueProjectRenders(db, { organizationId: ORG, projectId });
    expect(first.renders).toHaveLength(12);
    expect(first.creditsReserved).toBe(12);
    expect(await balance()).toBe(88);
    renderIds = first.renders;

    const again = await enqueueProjectRenders(db, { organizationId: ORG, projectId });
    expect(again.creditsReserved).toBe(0);
    expect(again.renders.every((r) => !r.needsWork)).toBe(true);
    expect(again.renders.map((r) => r.renderId).sort()).toEqual(first.renders.map((r) => r.renderId).sort());
    expect(await balance()).toBe(88);
  });

  it("renderiza os 12 vídeos: 1080×1920, ≤ 60 s, legenda sincronizada e sem estalo nas emendas", async () => {
    for (const r of renderIds) await renderCombination(deps, { organizationId: ORG, jobId: r.jobId, renderId: r.renderId }, CTX);

    const rows = (
      await pg.query<{ id: string; status: string; code: string; duration_ms: number; width: number; height: number; error_pt: string | null; r2_key: string; meta: { captionWords: CaptionWord[]; timeline: { pieces: { outStartMs: number }[]; totalFrames: number } } }>(
        `select r.id, r.status, c.code, r.duration_ms, r.width, r.height, r.error_pt, a.r2_key, r.meta
           from renders r join combinations c on c.id = r.combination_id left join media_assets a on a.id = r.asset_id
          where r.project_id = $1 order by c.code`,
        [projectId],
      )
    ).rows;
    expect(rows).toHaveLength(12);

    let worstSyncMs = 0;
    for (const r of rows) {
      expect(r.error_pt, r.code).toBeNull();
      expect(r.status, r.code).toBe("succeeded");
      expect(r.r2_key).toMatch(new RegExp(`/renders/${projectId}/${r.code}-[0-9a-f]{8}\\.mp4$`));
      expect([r.width, r.height]).toEqual([1080, 1920]);
      expect(r.duration_ms, r.code).toBeLessThanOrEqual(60_000);

      const out = path.join(dir, `${r.code}.mp4`);
      await store.download(r.r2_key, out);
      const info = await probe(out);
      expect(info.width).toBe(1080);
      expect(info.height).toBe(1920);
      expect(info.fps).toBeCloseTo(30, 3);
      expect(info.durationMs).toBeLessThanOrEqual(60_000);
      expect(Math.abs(info.durationMs - (r.meta.timeline.totalFrames * 1000) / 30)).toBeLessThan(100);

      // legenda: bipes medidos no MP4 final × tempos de palavra gravados
      const audio16 = await decodeMono(out, 16000);
      const beeps = detectBeeps(audio16, 16000);
      const words = r.meta.captionWords;
      expect(beeps.length, `${r.code}: palavras na legenda × bipes no áudio`).toBe(words.length);
      for (const [i, w] of words.entries()) {
        const err = Math.abs(beeps[i]!.startMs - w.startMs);
        worstSyncMs = Math.max(worstSyncMs, err);
        expect(err, `${r.code} palavra ${i + 1}`).toBeLessThan(150);
      }

      // o arquivo .ass tem os mesmos tempos das palavras (arredondados a centésimos)
      const dialogues = parseAssDialogues(buildAss(words, DEFAULT_CAPTION_STYLE));
      expect(dialogues.length).toBeGreaterThan(0);
      for (const d of dialogues) {
        expect(words.some((w) => Math.abs(w.startMs - d.startMs) <= 10), `${r.code}: legenda em ${d.startMs} ms sem palavra correspondente`).toBe(true);
      }

      // emendas: o zumbido contínuo expõe qualquer estalo
      const audio48 = await decodeMono(out, 48000);
      const splices = r.meta.timeline.pieces.slice(1).map((p) => p.outStartMs);
      const quiet: number[] = [];
      for (let t = 70; t + 10 < info.durationMs - 70; t += 10) {
        if (splices.some((s) => Math.abs(t - s) < 80)) continue;
        let sum = 0;
        const a = Math.round(t * 48);
        for (let k = a; k < a + 480; k++) sum += audio48[k]! * audio48[k]!;
        if (Math.sqrt(sum / 480) < 0.15) quiet.push(maxStepIn(audio48, 48000, t, t + 10));
      }
      const natural = median(quiet);
      expect(quiet.length, `${r.code}: trechos de silêncio para medir`).toBeGreaterThan(5);
      for (const s of splices) {
        const step = maxStepIn(audio48, 48000, s - 25, s + 25);
        expect(step, `${r.code}: estalo na emenda em ${s} ms (normal ${natural.toFixed(5)})`).toBeLessThanOrEqual(Math.max(natural * 4, 5e-4));
      }
    }
    // eslint-disable-next-line no-console
    console.log(`pior erro de sincronia da legenda: ${worstSyncMs.toFixed(1)} ms`);
  }, 600_000);

  it("confirma os créditos (nada devolvido, nenhuma reserva pendente) e fecha o projeto", async () => {
    expect(await balance()).toBe(88);
    const commits = await pg.query("select 1 from credits_ledger where organization_id = $1 and reason = 'commit'", [ORG]);
    expect(commits.rows).toHaveLength(12);
    const active = await pg.query<{ n: number }>("select count(*)::int as n from credits_ledger r where reason = 'reserve' and public._credit_active_reserve(organization_id, ref_type, ref_id) = r.id");
    expect(active.rows[0]!.n).toBe(0);
    const p = await pg.query<{ status: string }>("select status from projects where id = $1", [projectId]);
    expect(p.rows[0]!.status).toBe("done");
    const usage = await pg.query("select 1 from usage_events where organization_id = $1 and kind = 'render'", [ORG]);
    expect(usage.rows).toHaveLength(12);
  });

  it("repetir o job de um render pronto não faz trabalho nem cobra de novo", async () => {
    const r = renderIds[0]!;
    const before = (await pg.query<{ finished_at: string }>("select finished_at from renders where id = $1", [r.renderId])).rows[0]!.finished_at;
    await renderCombination(deps, { organizationId: ORG, jobId: r.jobId, renderId: r.renderId }, CTX);
    const after = (await pg.query<{ finished_at: string; status: string }>("select finished_at, status from renders where id = $1", [r.renderId])).rows[0]!;
    expect(after.status).toBe("succeeded");
    expect(String(after.finished_at)).toBe(String(before));
    expect(await balance()).toBe(88);
  }, 60_000);

  it("monta o ZIP com os 12 arquivos nomeados pelo código", async () => {
    const job = await upsertJob(db, { organizationId: ORG, projectId, kind: "zip", idempotencyKey: "zip:test" });
    await buildZip(deps, { organizationId: ORG, jobId: job.id, projectId, renderIds: renderIds.map((r) => r.renderId) }, CTX);
    const result = (await pg.query<{ status: string; result: { key: string; count: number } }>("select status, result from jobs where id = $1", [job.id])).rows[0]!;
    expect(result.status).toBe("succeeded");
    expect(result.result.count).toBe(12);

    const zipFile = path.join(dir, "all.zip");
    await store.download(result.result.key, zipFile);
    const entries = listZip(await readFile(zipFile));
    expect(entries.map((e) => e.name).sort()).toEqual(renderIds.map((r) => `${r.code}.mp4`).sort());
    const sizes = new Map((await pg.query<{ code: string; size_bytes: string }>("select c.code, r.size_bytes from renders r join combinations c on c.id = r.combination_id where r.project_id = $1", [projectId])).rows.map((r) => [`${r.code}.mp4`, Number(r.size_bytes)]));
    for (const e of entries) expect(e.size, e.name).toBe(sizes.get(e.name));
  }, 120_000);

  it("controle negativo: sem o fade de 50 ms as mesmas emendas estalam (o detector de estalo funciona)", async () => {
    let worstRatio = 0;
    for (const r of renderIds.slice(0, 6)) {
      const rc = await loadRenderContext(db, ORG, r.renderId);
      const sourcesMap: Record<string, string> = {};
      for (const [i, seg] of rc.segments.entries()) {
        if (sourcesMap[seg.source_video_id]) continue;
        sourcesMap[seg.source_video_id] = path.join(dir, `neg_src_${r.code}_${i}.mp4`);
        await store.download(seg.pre_key!, sourcesMap[seg.source_video_id]!);
      }
      const timeline = buildTimeline(
        await Promise.all(
          rc.segments.map(async (seg) => {
            const cut = computeCut(seg.words, seg.start_word_idx, seg.end_word_idx, seg.duration_ms, { envelope: await energyEnvelope(sourcesMap[seg.source_video_id]!) });
            return { segmentId: seg.id, sourceVideoId: seg.source_video_id, type: seg.type, srcStartMs: cut.srcStartMs, srcEndMs: cut.srcEndMs, words: seg.words.slice(seg.start_word_idx, seg.end_word_idx + 1) };
          }),
        ),
      );
      const out = path.join(dir, `neg_${r.code}.mp4`);
      await renderVariation({ workDir: path.join(dir, `neg_w_${r.code}`), sources: sourcesMap, timeline, outFile: out, captions: false, fadeMs: 0.001 });
      const audio = await decodeMono(out, 48000);
      let worst = 0;
      for (const p of timeline.pieces.slice(1)) worst = Math.max(worst, maxStepIn(audio, 48000, p.outStartMs - 25, p.outStartMs + 25));
      worstRatio = Math.max(worstRatio, worst / 5e-4);
    }
    // sem fade, ao menos uma emenda tem salto bem acima do limite usado no teste principal
    expect(worstRatio).toBeGreaterThan(2);
  }, 300_000);

  it("não transcreve de novo um arquivo idêntico (cache por hash)", async () => {
    const other = (await pg.query<{ id: string }>("insert into projects (organization_id, name) values ($1, 'Outro') returning id", [ORG])).rows[0]!.id;
    const calls = transcriber.calls;
    const s = await addSource(other, "hook", 0, path.join(dir, "hook1.mp4"));
    await runProcess(s);
    expect(transcriber.calls).toBe(calls);
    const job = (await pg.query<{ result: { fromCache: boolean } }>("select result from jobs where id = $1", [s.jobId])).rows[0]!;
    expect(job.result.fromCache).toBe(true);
  }, 120_000);

  it("vídeo acima de 3 min é recusado com mensagem em português e o job termina como falho", async () => {
    const other = (await pg.query<{ id: string }>("insert into projects (organization_id, name) values ($1, 'Longo') returning id", [ORG])).rows[0]!.id;
    const long = path.join(dir, "long.mp4");
    await makeBeepVideo(long, { seconds: 185, freq: 440, beeps: [{ startS: 1, endS: 2 }] });
    const s = await addSource(other, "body", 0, long);
    await runProcess(s);
    const sv = (await pg.query<{ status: string; error_pt: string }>("select status, error_pt from source_videos where id = $1", [s.id])).rows[0]!;
    expect(sv.status).toBe("failed");
    expect(sv.error_pt).toMatch(/limite/i);
    const job = (await pg.query<{ status: string; error_pt: string }>("select status, error_pt from jobs where id = $1", [s.jobId])).rows[0]!;
    expect(job.status).toBe("failed");
    expect(job.error_pt).toMatch(/3min00s/);
  }, 300_000);
});
