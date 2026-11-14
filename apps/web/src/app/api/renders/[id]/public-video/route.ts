import { NextResponse } from "next/server";
import { UserFacingError, verifyPublicRenderToken } from "@mercatta/server";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { downloadUrl } from "@/lib/storage";

/**
 * Rota pública autenticada por HMAC (`?token=...`) para que os servidores da Meta (Instagram Graph API)
 * possam baixar o arquivo MP4 ao criar o container de Reel, Post ou Carrossel.
 */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    const secret = serverEnv().SETTINGS_ENCRYPTION_KEY ?? "";
    if (!verifyPublicRenderToken(id, token, secret)) {
      throw new UserFacingError("Token de acesso ao vídeo inválido.");
    }

    const r = await getDb().query<{ r2_key: string; code: string }>(
      `select a.r2_key, c.code
         from renders r
         join combinations c on c.id = r.combination_id
         join media_assets a on a.id = r.asset_id
        where r.id = $1 and r.status = 'succeeded'`,
      [id],
    );
    const row = r.rows[0];
    if (!row) throw new UserFacingError("Vídeo não encontrado.");
    return NextResponse.redirect(new URL(await downloadUrl(row.r2_key, `${row.code}.mp4`), req.url), 302);
  });
}
