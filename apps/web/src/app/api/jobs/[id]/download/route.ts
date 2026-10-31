import { NextResponse } from "next/server";
import { UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { recordAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { downloadUrl } from "@/lib/storage";

/** Baixar o ZIP gerado por um job. */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const { organizationId } = await recordAccess(user.id, "jobs", id, "read");
    const r = await getDb().query<{ r2_key: string }>(
      `select a.r2_key from jobs j
         join media_assets a on a.id = (j.result->>'assetId')::uuid and a.organization_id = j.organization_id
        where j.organization_id = $1 and j.id = $2 and j.kind = 'zip' and j.status = 'succeeded'
          and (a.expires_at is null or a.expires_at > now()) and a.status = 'ready'`,
      [organizationId, id],
    );
    const row = r.rows[0];
    if (!row) throw new UserFacingError("Este ZIP não está disponível (ainda não terminou ou já expirou). Gere de novo.");
    return NextResponse.redirect(new URL(await downloadUrl(row.r2_key, "mercatta-mix-videos.zip"), req.url), 302);
  });
}
