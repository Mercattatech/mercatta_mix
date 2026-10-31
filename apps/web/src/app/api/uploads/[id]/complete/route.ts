import { z } from "zod";
import { finishUpload, getSourceVideoForUpload, UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { recordAccess } from "@/lib/access";
import { getDb, getQueue } from "@/lib/db";
import { completeMultipart, isLocalStorage } from "@/lib/storage";

const body = z.object({
  uploadId: z.string().optional(),
  parts: z.array(z.object({ PartNumber: z.number().int().min(1), ETag: z.string().min(1) })).optional(),
  language: z.enum(["pt", "en", "es"]).default("pt"),
});

/** Passo final: fecha o envio, cria o job de processamento e publica na fila. */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const input = body.parse(await req.json());
    const { organizationId } = await recordAccess(user.id, "source_videos", id, "write");
    const db = getDb();
    const sv = await getSourceVideoForUpload(db, organizationId, id);

    if (sv.status === "uploading" && !isLocalStorage()) {
      if (!input.uploadId || !input.parts?.length) throw new UserFacingError("Envio incompleto.");
      await completeMultipart(sv.key, input.uploadId, input.parts);
    }
    const job = await finishUpload(db, { organizationId, sourceVideoId: id, language: input.language });
    // publica depois do commit; se falhar aqui, o botão "tentar de novo" repete (o job é idempotente)
    if (job.created) {
      await (await getQueue()).publish("source-process", { organizationId, jobId: job.jobId, sourceVideoId: id, language: job.language });
    }
    return { jobId: job.jobId };
  });
}
