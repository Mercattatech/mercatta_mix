import { z } from "zod";
import { prepareZip } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser, projectAccess } from "@/lib/auth";
import { getDb, getQueue } from "@/lib/db";

const body = z.object({ renderIds: z.array(z.uuid()).max(2000).optional() });

/** Pede o ZIP dos vídeos prontos. */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const input = body.parse(await req.json().catch(() => ({})));
    const { organizationId } = await projectAccess(user.id, projectId, "read");
    const zip = await prepareZip(getDb(), { organizationId, projectId, ...(input.renderIds ? { renderIds: input.renderIds } : {}) });
    await (await getQueue()).publish("zip-build", { organizationId, jobId: zip.jobId, projectId, renderIds: zip.renderIds });
    return { jobId: zip.jobId, count: zip.renderIds.length };
  });
}
