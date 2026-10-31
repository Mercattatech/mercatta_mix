import { getSourceVideoForUpload, UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { recordAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { isLocalStorage, saveLocal } from "@/lib/storage";

/** Envio do arquivo inteiro — só no modo local (desenvolvimento, sem R2). */
export function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    if (!isLocalStorage()) throw new UserFacingError("Use o envio em partes.");
    const { organizationId } = await recordAccess(user.id, "source_videos", id, "write");
    const sv = await getSourceVideoForUpload(getDb(), organizationId, id);
    if (sv.status !== "uploading") throw new UserFacingError("Este vídeo já foi enviado.");
    if (!req.body) throw new UserFacingError("Arquivo vazio.");
    const size = await saveLocal(sv.key, req.body, sv.sizeBytes + 1024);
    return { sizeBytes: size };
  });
}
