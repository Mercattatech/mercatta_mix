import { z } from "zod";
import { enqueueProjectRenders } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser, projectAccess } from "@/lib/auth";
import { getDb, getQueue } from "@/lib/db";

const body = z.object({ combinationIds: z.array(z.uuid()).max(2000).optional() });

/** Pede os vídeos: reserva os créditos numa transação (tudo ou nada) e só então publica os jobs na fila. */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const input = body.parse(await req.json().catch(() => ({})));
    const { organizationId } = await projectAccess(user.id, projectId, "write");

    const res = await enqueueProjectRenders(getDb(), { organizationId, projectId, ...(input.combinationIds ? { combinationIds: input.combinationIds } : {}) });
    const queue = await getQueue();
    for (const j of res.toPublish) {
      await queue.publish("render-run", { organizationId, jobId: j.jobId, renderId: j.renderId }, { priority: j.priority });
    }
    return { total: res.renders.length, queued: res.toPublish.length, creditsReserved: res.creditsReserved };
  });
}
