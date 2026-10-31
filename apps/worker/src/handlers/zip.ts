import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipArchive } from "archiver";
import { UserFacingError, type JobContext, type ZipPayload } from "@mercatta/server";
import { logger, type WorkerDeps } from "../deps";
import { runTrackedJob } from "./lifecycle";

/** Quanto tempo o ZIP fica disponível para baixar. */
const ZIP_TTL_DAYS = 7;

/**
 * Junta os vídeos prontos num ZIP (sem recomprimir: MP4 já é comprimido), com o nome de cada arquivo = código
 * da combinação (H1_M1_C1.mp4).
 */
export async function buildZip(deps: WorkerDeps, payload: ZipPayload, ctx: JobContext): Promise<void> {
  const org = payload.organizationId;
  const log = logger(deps);

  await runTrackedJob(deps, { organizationId: org, jobId: payload.jobId, ctx }, async ({ workDir, progress }) => {
    const rows = (
      await deps.db.query<{ code: string; r2_key: string }>(
        `select c.code, a.r2_key
           from renders r
           join combinations c on c.id = r.combination_id and c.organization_id = r.organization_id
           join media_assets a on a.id = r.asset_id and a.organization_id = r.organization_id
          where r.organization_id = $1 and r.project_id = $2 and r.id = any($3::uuid[]) and r.status = 'succeeded'
          order by c.code`,
        [org, payload.projectId, payload.renderIds],
      )
    ).rows;
    if (rows.length === 0) throw new UserFacingError("Nenhum vídeo pronto para baixar ainda.");

    const files: { code: string; file: string }[] = [];
    for (const [i, row] of rows.entries()) {
      await progress(5 + Math.round((i / rows.length) * 70), `Baixando ${row.code}`);
      const file = path.join(workDir, `r${i}.mp4`);
      await deps.store.download(row.r2_key, file);
      files.push({ code: row.code, file });
    }

    await progress(80, "Compactando");
    const zipPath = path.join(workDir, "videos.zip");
    const archive = new ZipArchive({ store: true });
    const done = pipeline(archive, createWriteStream(zipPath));
    for (const f of files) archive.file(f.file, { name: `${f.code}.mp4` });
    await archive.finalize();
    await done;

    await progress(92, "Salvando o arquivo");
    const key = `org/${org}/zips/${payload.projectId}/${payload.jobId}.zip`;
    const { sizeBytes } = await deps.store.upload(zipPath, key, "application/zip");
    const asset = (
      await deps.db.query<{ id: string }>(
        `insert into media_assets (organization_id, kind, r2_key, size_bytes, mime, status, expires_at)
         values ($1, 'zip', $2, $3, 'application/zip', 'ready', now() + make_interval(days => $4))
         on conflict (r2_key) do update set size_bytes = excluded.size_bytes, status = 'ready', expires_at = excluded.expires_at
         returning id`,
        [org, key, sizeBytes, ZIP_TTL_DAYS],
      )
    ).rows[0]!;

    log("zip.done", { jobId: payload.jobId, files: files.length, sizeBytes });
    return { assetId: asset.id, key, sizeBytes, count: files.length };
  });
}
