import { z } from "zod";
import { createSegment } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser, projectAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";

const body = z.object({
  sourceVideoId: z.uuid(),
  startWordIdx: z.number().int().min(0),
  endWordIdx: z.number().int().min(0),
  label: z.string().trim().max(80).optional(),
});

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const input = body.parse(await req.json());
    const { organizationId } = await projectAccess(user.id, projectId, "write");
    return createSegment(getDb(), { organizationId, projectId, ...input });
  });
}
