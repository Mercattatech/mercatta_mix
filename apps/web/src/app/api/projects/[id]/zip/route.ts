import { z } from "zod";
import { prepareZip } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser, projectAccess } from "@/lib/auth";
import { getDb, getQueue } from "@/lib/db";

const body = z.object({ renderIds: z.array(z.uuid()).max(2000).optional() });

/** Consulta status do job de ZIP. */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const { organizationId } = await projectAccess(user.id, projectId, "read");
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) return { status: "unknown" };
    const r = await getDb().query<{ id: string; status: string; progress: number; error_pt: string | null }>(
      "select id, status, progress, error_pt from jobs where organization_id = $1 and project_id = $2 and id = $3 and kind = 'zip'",
      [organizationId, projectId, jobId],
    );
    const job = r.rows[0];
    if (!job) return { status: "not_found" };
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error_pt,
      downloadUrl: job.status === "succeeded" ? `/api/jobs/${job.id}/download` : null,
    };
  });
}

/** Pede o ZIP dos vídeos prontos. */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const input = body.parse(await req.json().catch(() => ({})));
    const { organizationId } = await projectAccess(user.id, projectId, "read");
    const zip = await prepareZip(getDb(), { organizationId, projectId, ...(input.renderIds ? { renderIds: input.renderIds } : {}) });
    if (zip.needsWork || zip.status === "queued") {
      await (await getQueue()).publish("zip-build", { organizationId, jobId: zip.jobId, projectId, renderIds: zip.renderIds });
    }
    return {
      jobId: zip.jobId,
      count: zip.renderIds.length,
      status: zip.status,
      downloadUrl: zip.status === "succeeded" ? `/api/jobs/${zip.jobId}/download` : null,
    };
  });
}
