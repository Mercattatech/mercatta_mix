import { NextResponse } from "next/server";
import { UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { recordAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { downloadUrl } from "@/lib/storage";

/** Baixar um vídeo pronto: confere a permissão e redireciona para um link temporário. */
export function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const { organizationId } = await recordAccess(user.id, "renders", id, "read");
    const r = await getDb().query<{ r2_key: string; code: string }>(
      `select a.r2_key, c.code from renders r
         join combinations c on c.id = r.combination_id and c.organization_id = r.organization_id
         join media_assets a on a.id = r.asset_id and a.organization_id = r.organization_id
        where r.organization_id = $1 and r.id = $2 and r.status = 'succeeded'`,
      [organizationId, id],
    );
    const row = r.rows[0];
    if (!row) throw new UserFacingError("Este vídeo ainda não está pronto.");
    return NextResponse.redirect(new URL(await downloadUrl(row.r2_key, `${row.code}.mp4`), _req.url), 302);
  });
}
