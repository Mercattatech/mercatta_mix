import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge } from "@/components/ui";
import { supabaseForUser } from "@/lib/auth";
import { getAppContext } from "@/lib/context";
import { CombinePanel } from "./combine-panel";
import { LiveRefresh } from "./live-refresh";
import { ResultsPanel } from "./results-panel";
import { SegmentEditor } from "./segment-editor";
import type { JobRow, RenderRow, SegmentRow, VideoRow, Word } from "./types";
import { UploadPanel } from "./upload-panel";

export const metadata: Metadata = { title: "Projeto" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await getAppContext();
  const supabase = await supabaseForUser();

  // tudo passa pela RLS: se o projeto não é da empresa do usuário, simplesmente não aparece
  const { data: project } = await supabase.from("projects").select("id, name, status, organization_id").eq("id", id).maybeSingle();
  if (!project) notFound();

  const [videosRes, segmentsRes, combosRes, rendersRes, jobsRes] = await Promise.all([
    supabase.from("source_videos").select("id, type, original_filename, status, error_pt, duration_ms, sort_order").eq("project_id", id).order("sort_order").order("created_at"),
    supabase.from("segments").select("id, source_video_id, type, start_word_idx, end_word_idx, start_ms, end_ms, label").eq("project_id", id).order("sort_order").order("created_at"),
    supabase.from("combinations").select("id, code").eq("project_id", id),
    supabase.from("renders").select("id, combination_id, status, duration_ms, error_pt").eq("project_id", id),
    supabase
      .from("jobs")
      .select("id, kind, status, progress, step_label, error_pt, ref_id, result, created_at")
      .eq("project_id", id)
      .in("kind", ["upload_process", "zip"])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const videos = (videosRes.data ?? []) as VideoRow[];
  const segments = (segmentsRes.data ?? []) as SegmentRow[];
  const jobs = (jobsRes.data ?? []) as JobRow[];
  const codeById = new Map((combosRes.data ?? []).map((c) => [c.id as string, c.code as string]));
  const renders: RenderRow[] = (rendersRes.data ?? [])
    .map((r) => ({ ...(r as Omit<RenderRow, "code">), code: codeById.get(r.combination_id as string) ?? "?" }))
    .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));

  const readyIds = videos.filter((v) => v.status === "ready").map((v) => v.id);
  const words: Record<string, Word[]> = {};
  if (readyIds.length > 0) {
    const { data } = await supabase.from("transcripts").select("source_video_id, words").in("source_video_id", readyIds);
    for (const t of data ?? []) words[t.source_video_id as string] = (t.words as Word[]) ?? [];
  }

  const canWrite = ctx.organization?.role !== "aprovador";
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
      <CombinePanel projectId={id} segments={segments} credits={ctx.credits} canWrite={canWrite} />
      <ResultsPanel projectId={id} renders={renders} jobs={jobs} />
    </div>
  );
}
