import { readFile } from "node:fs/promises";
import path from "node:path";
import { executeInstagramPublish, type JobContext, type PublishPayload } from "@mercatta/server";
import { logger, type WorkerDeps } from "../deps";
import { runTrackedJob } from "./lifecycle";

export async function publishToInstagram(deps: WorkerDeps, payload: PublishPayload, ctx: JobContext): Promise<void> {
  const org = payload.organizationId;
  const log = logger(deps);

  await runTrackedJob(
    deps,
    {
      organizationId: org,
      jobId: payload.jobId,
      ctx,
      onFinalFailure: async (sql, message) => {
        await sql.query(
          "update social_schedules set status = 'failed', error_pt = $3, updated_at = now() where organization_id = $1 and id = $2 and status <> 'published'",
          [org, payload.scheduleId, message],
        );
      },
    },
    async ({ workDir, progress }) => {
      await progress(15, "Enviando mídia para o Instagram Graph API");
      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const encryptionKeyRaw = process.env.SETTINGS_ENCRYPTION_KEY;
      const res = await executeInstagramPublish(deps.db, {
        organizationId: org,
        scheduleId: payload.scheduleId,
        appUrl,
        ...(encryptionKeyRaw ? { encryptionKeyRaw } : {}),
        readVideoBuffer: async (renderId, r2Key) => {
          const destPath = path.join(workDir, `${renderId}.mp4`);
          await deps.store.download(r2Key, destPath);
          return readFile(destPath);
        },
      });
      await progress(100, "Publicado no Instagram");
      log("instagram.published", { scheduleId: payload.scheduleId, igMediaId: res.igMediaId, permalink: res.permalink });
      return res;
    },
  );
}

