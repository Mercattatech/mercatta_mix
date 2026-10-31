import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { handle } from "@/lib/api";
import { ApiError, requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertCanRead } from "@mercatta/server";
import { isLocalStorage, localFilePath } from "@/lib/storage";

/** Só desenvolvimento (armazenamento local): serve o arquivo depois de conferir a empresa na própria chave. */
export function GET(req: Request) {
  return handle(async () => {
    if (!isLocalStorage()) throw new ApiError(404, "Não encontrado.");
    const user = await requireApiUser();
    const url = new URL(req.url);
    const key = url.searchParams.get("key") ?? "";
    const name = (url.searchParams.get("name") ?? "arquivo").replace(/[^A-Za-z0-9._-]/g, "_");
    const m = /^org\/([0-9a-f-]{36})\//i.exec(key);
    if (!m) throw new ApiError(400, "Chave inválida.");
    await assertCanRead(getDb(), user.id, m[1]!);
    const file = localFilePath(key);
    const size = (await stat(file).catch(() => null))?.size;
    if (size === undefined) throw new ApiError(404, "Arquivo não encontrado.");
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: { "Content-Type": name.endsWith(".zip") ? "application/zip" : "video/mp4", "Content-Length": String(size), "Content-Disposition": `attachment; filename="${name}"` },
    });
  });
}
