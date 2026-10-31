import { z } from "zod";
import { createSourceVideo, isSegmentType, UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser, projectAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isLocalStorage, startMultipart, UPLOAD_PART_SIZE } from "@/lib/storage";

const body = z.object({
  projectId: z.uuid(),
  type: z.string(),
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

/** Passo 1 do envio: valida o arquivo, registra o vídeo e abre o envio em partes (R2) ou o envio local (dev). */
export function POST(req: Request) {
  return handle(async () => {
    const user = await requireApiUser();
    const input = body.parse(await req.json());
    if (!isSegmentType(input.type)) throw new UserFacingError("Tipo de vídeo inválido.");
    const { organizationId } = await projectAccess(user.id, input.projectId, "write");

    const video = await createSourceVideo(getDb(), { organizationId, projectId: input.projectId, type: input.type, filename: input.filename, sizeBytes: input.sizeBytes, userId: user.id });
    if (isLocalStorage()) return { sourceVideoId: video.sourceVideoId, mode: "local" as const };

    const mime = input.filename.toLowerCase().endsWith(".mov") ? "video/quicktime" : input.filename.toLowerCase().endsWith(".mkv") ? "video/x-matroska" : "video/mp4";
    const { uploadId } = await startMultipart(video.key, mime);
    return { sourceVideoId: video.sourceVideoId, mode: "r2" as const, uploadId, partSize: UPLOAD_PART_SIZE, parts: Math.ceil(input.sizeBytes / UPLOAD_PART_SIZE) };
  });
}
