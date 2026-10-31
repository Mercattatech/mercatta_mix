import { z } from "zod";
import { generateProjectCombinations, getRenderCreditCost, previewCombinations } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser, projectAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";

const body = z.object({
  extraPosition: z.enum(["afterHook", "afterBody", "afterCta"]).optional(),
  extraMode: z.enum(["include", "optional"]).optional(),
  sample: z.object({ n: z.number().int().min(1).max(2000), seed: z.number().int().optional() }).optional(),
});

/** Prévia: quantos vídeos sairiam e quanto custa — mostrado ANTES de renderizar. */
export function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const { organizationId } = await projectAccess(user.id, projectId, "read");
    const db = getDb();
    const p = await previewCombinations(db, { organizationId, projectId });
    const perRender = await getRenderCreditCost(db);
    return { count: p.fullCount, creditsPerVideo: perRender, credits: p.fullCount * perRender, violations: p.violations };
  });
}

/** Gera (ou atualiza) as combinações do projeto. */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const input = body.parse(await req.json().catch(() => ({})));
    const { organizationId } = await projectAccess(user.id, projectId, "write");
    const db = getDb();
    const res = await generateProjectCombinations(db, { organizationId, projectId, ...input });
    await db.query("update projects set status = 'ready' where organization_id = $1 and id = $2 and status in ('draft', 'processing')", [organizationId, projectId]);
    const perRender = await getRenderCreditCost(db);
    return { total: res.total, generated: res.generated, creditsPerVideo: perRender, credits: res.generated * perRender, violations: res.violations };
  });
}
