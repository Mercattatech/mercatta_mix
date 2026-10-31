import { z } from "zod";
import { getSourceVideoForUpload, UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { recordAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { isLocalStorage, presignPart } from "@/lib/storage";

const body = z.object({ uploadId: z.string().min(1), partNumber: z.number().int().min(1).max(10_000) });

/** Link assinado de uma parte (o navegador envia a parte direto ao R2). */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const input = body.parse(await req.json());
    if (isLocalStorage()) throw new UserFacingError("Envio em partes não se aplica ao armazenamento local.");
    const { organizationId } = await recordAccess(user.id, "source_videos", id, "write");
    const sv = await getSourceVideoForUpload(getDb(), organizationId, id);
    if (sv.status !== "uploading") throw new UserFacingError("Este vídeo já foi enviado.");
    return { url: await presignPart(sv.key, input.uploadId, input.partNumber) };
  });
}
