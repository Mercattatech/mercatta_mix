import "server-only";
import { ForbiddenError, assertCanRead, assertCanWrite } from "@mercatta/server";
import { getDb } from "./db";

/** Descobre a empresa dona de um registro e confere a permissão. "Não existe" e "não é seu" dão a mesma resposta. */
async function orgOf(table: "source_videos" | "renders" | "jobs" | "segments", id: string): Promise<{ organizationId: string; projectId: string | null }> {
  const r = await getDb().query<{ organization_id: string; project_id: string | null }>(`select organization_id, project_id from ${table} where id = $1`, [id]);
  const row = r.rows[0];
  if (!row) throw new ForbiddenError();
  return { organizationId: row.organization_id, projectId: row.project_id };
}

export async function recordAccess(
  userId: string,
  table: "source_videos" | "renders" | "jobs" | "segments",
  id: string,
  mode: "read" | "write",
): Promise<{ organizationId: string; projectId: string | null }> {
  const rec = await orgOf(table, id);
  if (mode === "write") await assertCanWrite(getDb(), userId, rec.organizationId);
  else await assertCanRead(getDb(), userId, rec.organizationId);
  return rec;
}
