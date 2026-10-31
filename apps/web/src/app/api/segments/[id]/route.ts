import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { recordAccess } from "@/lib/access";
import { getDb } from "@/lib/db";

export function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const { organizationId } = await recordAccess(user.id, "segments", id, "write");
    // as combinações que usavam este trecho saem junto (cascata); renders já feitos também
    await getDb().query("delete from segments where organization_id = $1 and id = $2", [organizationId, id]);
    return { ok: true };
  });
}
