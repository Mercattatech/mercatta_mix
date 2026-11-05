import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForbiddenError, assertCanRead, assertCanWrite, ensureDefaultSegments, getPricingConfig } from "@mercatta/server";
import { Alert, Badge } from "@/components/ui";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";
import { CombinePanel } from "./combine-panel";
import { LiveRefresh } from "./live-refresh";
import { ResultsPanel } from "./results-panel";
import { SegmentEditor } from "./segment-editor";
import type { JobRow, RenderRow, SegmentRow, VideoRow, Word } from "./types";
import { UploadPanel } from "./upload-panel";

export const metadata: Metadata = { title: "Projeto" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function can(check: () => Promise<void>): Promise<boolean> {
  try {
    await check();
    return true;
  } catch (e) {
    if (e instanceof ForbiddenError) return false;
    throw e;
  }
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await getAppContext();
  const db = getDb();

  const project = (
    await db.query<{ id: string; name: string; organization_id: string; settings: Record<string, unknown>; editing_instructions: string | null }>(
      "select id, name, organization_id, settings, editing_instructions from projects where id = $1",
      [id],
    )
  ).rows[0];
  // "não existe" e "não é seu" dão a mesma resposta (404)
  if (!project || !(await can(() => assertCanRead(db, ctx.user.id, project.organization_id)))) notFound();
  const canWrite = await can(() => assertCanWrite(db, ctx.user.id, project.organization_id));

  await ensureDefaultSegments(db, project.organization_id, id);

  const [videosRes, segmentsRes, combosRes, rendersRes, jobsRes, balanceRes, pricing] = await Promise.all([
    db.query<VideoRow>("select id, type, original_filename, status, error_pt, duration_ms, sort_order from source_videos where project_id = $1 order by sort_order, created_at", [id]),
    db.query<SegmentRow>("select id, source_video_id, type, start_word_idx, end_word_idx, start_ms, end_ms, label from segments where project_id = $1 order by sort_order, created_at", [id]),
    db.query<{ id: string; code: string }>("select id, code from combinations where project_id = $1", [id]),
    db.query<Omit<RenderRow, "code">>(
      `select distinct on (r.combination_id) r.id, r.combination_id, r.status, r.duration_ms, r.error_pt
         from renders r
         join combinations c on c.id = r.combination_id
        where r.project_id = $1
        order by r.combination_id, (r.plan_hash = c.plan_hash) desc, r.created_at desc`,
      [id],
    ),
    db.query<Omit<JobRow, "created_at"> & { created_at: Date }>(
      `select id, kind, status, progress, step_label, error_pt, ref_id, result, created_at
         from jobs where project_id = $1 and kind in ('upload_process', 'zip') order by created_at desc limit 100`,
      [id],
    ),
    db.query<{ b: string }>("select credit_balance($1) as b", [project.organization_id]),
    getPricingConfig(db),
  ]);

  const videos = videosRes.rows;
  const segments = segmentsRes.rows;
  const jobs: JobRow[] = jobsRes.rows.map((j) => ({ ...j, created_at: j.created_at.toISOString() }));
  const credits = Number(balanceRes.rows[0]?.b ?? 0);
  const codeById = new Map(combosRes.rows.map((c) => [c.id, c.code]));
  const renders: RenderRow[] = rendersRes.rows
    .map((r) => ({ ...r, code: codeById.get(r.combination_id) ?? "?" }))
    .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));

  const readyIds = videos.filter((v) => v.status === "ready").map((v) => v.id);
  const words: Record<string, Word[]> = {};
  if (readyIds.length > 0) {
    const { rows } = await db.query<{ source_video_id: string; words: Word[] }>("select source_video_id, words from transcripts where source_video_id = any($1::uuid[])", [readyIds]);
    for (const t of rows) words[t.source_video_id] = t.words ?? [];
  }

  const active =
    videos.some((v) => v.status === "uploaded" || v.status === "processing") ||
    renders.some((r) => r.status === "queued" || r.status === "running") ||
    jobs.some((j) => j.kind === "zip" && (j.status === "queued" || j.status === "running"));

  return (
    <div className="animate-in space-y-12">
      <LiveRefresh projectId={id} active={active} />
      <header className="space-y-2">
        <Link href="/projects" className="text-sm text-muted transition hover:text-fg">
          ← Projetos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{project.name}</h1>
          {!canWrite && <Badge>Somente leitura</Badge>}
        </div>
      </header>

      {!canWrite && <Alert tone="primary">Você tem o papel de aprovador: pode ver e baixar os vídeos, mas não alterar o projeto.</Alert>}

      <UploadPanel projectId={id} videos={videos} jobs={jobs} canWrite={canWrite} />
      <SegmentEditor projectId={id} videos={videos} words={words} segments={segments} canWrite={canWrite} />
      <CombinePanel
        projectId={id}
        segments={segments}
        credits={credits}
        canWrite={canWrite}
        initialSettings={project.settings ?? {}}
        initialInstructions={project.editing_instructions ?? ""}
        pricing={pricing}
      />
      <ResultsPanel projectId={id} renders={renders} jobs={jobs} />
    </div>
  );
}
