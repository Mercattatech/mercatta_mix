import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { ProbeError } from "@mercatta/core";
import { UserFacingError, type JobContext, type ProcessSourcePayload, type Sql } from "@mercatta/server";
import { logger, type WorkerDeps } from "../deps";
import { preprocess, probe } from "../media";
import { runTrackedJob } from "./lifecycle";

/** SHA-256 de um arquivo, lendo em fluxo (arquivos de até 5 GB não cabem na memória). */
export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function loadMaxDurationMs(sql: Sql): Promise<number> {
  const r = await sql.query<{ value: { max_duration_ms?: number } }>("select value from platform_settings where key = 'upload_limits'");
  return r.rows[0]?.value?.max_duration_ms ?? 180_000;
}

/** Folga para vídeos de "3 minutos" que saem do celular com 3:00,04. */
const DURATION_TOLERANCE_MS = 500;

/**
 * Processa um vídeo enviado: baixa → confere duração → pré-processa (1080×1920, 30 fps, volume padrão) →
 * transcreve com tempo por palavra (reaproveitando a transcrição se o mesmo arquivo já foi transcrito).
 */
export async function processSource(deps: WorkerDeps, payload: ProcessSourcePayload, ctx: JobContext): Promise<void> {
  const org = payload.organizationId;
  const log = logger(deps);

  await runTrackedJob(
    deps,
    {
      organizationId: org,
      jobId: payload.jobId,
      ctx,
      onFinalFailure: async (sql, message) => {
        await sql.query("update source_videos set status = 'failed', error_pt = $3 where organization_id = $1 and id = $2", [org, payload.sourceVideoId, message]);
      },
    },
    async ({ workDir, progress }) => {
      const sv = (
        await deps.db.query<{ id: string; type: string; original_filename: string | null; asset_id: string; r2_key: string }>(
          `select sv.id, sv.type, sv.original_filename, a.id as asset_id, a.r2_key
             from source_videos sv join media_assets a on a.id = sv.asset_id and a.organization_id = sv.organization_id
            where sv.organization_id = $1 and sv.id = $2`,
          [org, payload.sourceVideoId],
        )
      ).rows[0];
      if (!sv) throw new UserFacingError("Este vídeo não foi encontrado. Envie o arquivo novamente.");

      await deps.db.query("update source_videos set status = 'processing', error_pt = null where organization_id = $1 and id = $2", [org, sv.id]);

      await progress(5, "Baixando o vídeo");
      const ext = path.extname(sv.r2_key) || ".mp4";
      const original = path.join(workDir, `original${ext}`);
      await deps.store.download(sv.r2_key, original);

      await progress(15, "Conferindo o arquivo");
      const sha = await sha256File(original);
      await deps.db.query("update media_assets set sha256 = $3, status = 'ready' where organization_id = $1 and id = $2", [org, sv.asset_id, sha]);

      let info;
      try {
        info = await probe(original);
      } catch (e) {
        if (e instanceof ProbeError) throw new UserFacingError("Não conseguimos ler este arquivo de vídeo. Ele pode estar corrompido ou sem imagem.");
        throw e;
      }
      const maxMs = await loadMaxDurationMs(deps.db);
      if (info.durationMs > maxMs + DURATION_TOLERANCE_MS) {
        throw new UserFacingError(`Este vídeo tem ${formatDuration(info.durationMs)}. O limite é de ${formatDuration(maxMs)} por vídeo.`);
      }
      if (!info.hasAudio) throw new UserFacingError("Este vídeo não tem áudio, então não dá para transcrever e cortar pela fala.");

      await progress(25, "Ajustando formato e volume");
      const pre = path.join(workDir, "pre.mp4");
      const preInfo = await preprocess(original, pre);
      const preSha = await sha256File(pre);
      const preKey = `org/${org}/pre/${sv.id}.mp4`;
      const { sizeBytes } = await deps.store.upload(pre, preKey, "video/mp4");
      const asset = (
        await deps.db.query<{ id: string }>(
          `insert into media_assets (organization_id, kind, r2_key, size_bytes, mime, sha256, status)
           values ($1, 'preprocessed', $2, $3, 'video/mp4', $4, 'ready')
           on conflict (r2_key) do update set size_bytes = excluded.size_bytes, sha256 = excluded.sha256, status = 'ready'
           returning id`,
          [org, preKey, sizeBytes, preSha],
        )
      ).rows[0]!;

      await progress(55, "Transcrevendo a fala");
      const { provider, model } = deps.transcriber;
      const cached = (
        await deps.db.query<{ words: unknown; full_text: string }>(
          `select words, full_text from transcripts where sha256 = $1 and language = $2 and provider = $3 and model = $4 limit 1`,
          [sha, payload.language, provider, model],
        )
      ).rows[0];

      let words: unknown;
      let fullText: string;
      let fromCache = false;
      if (cached) {
        words = cached.words;
        fullText = cached.full_text;
        fromCache = true;
      } else {
        const t = await deps.transcriber.transcribe({ mediaPath: pre, language: payload.language, workDir });
        words = t.words;
        fullText = t.text;
      }
      const wordCount = (words as unknown[]).length;
      if (wordCount === 0 && sv.type !== "extra") {
        throw new UserFacingError("Não encontramos fala neste vídeo. Confira se o áudio está audível e se o idioma escolhido está certo.");
      }

      await progress(90, "Salvando");
      await deps.db.transaction(async (tx) => {
        await tx.query(
          `insert into transcripts (organization_id, source_video_id, sha256, language, provider, model, words, full_text)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (source_video_id) do update set sha256 = excluded.sha256, language = excluded.language,
             provider = excluded.provider, model = excluded.model, words = excluded.words, full_text = excluded.full_text`,
          [org, sv.id, sha, payload.language, provider, model, JSON.stringify(words), fullText],
        );
        await tx.query(
          `update source_videos set preprocessed_asset_id = $3, duration_ms = $4, width = $5, height = $6, fps = $7,
                  status = 'ready', error_pt = null
            where organization_id = $1 and id = $2`,
          [org, sv.id, asset.id, preInfo.durationMs, preInfo.width, preInfo.height, preInfo.fps.toFixed(3)],
        );
        await tx.query("insert into usage_events (organization_id, kind, qty, ref_type, ref_id) values ($1, 'transcribe', $2, 'source_video', $3)", [
          org,
          fromCache ? 0 : preInfo.durationMs / 60_000,
          sv.id,
        ]);
      });
      log("source.processed", { sourceVideoId: sv.id, words: wordCount, fromCache });
      return { sourceVideoId: sv.id, words: wordCount, fromCache, durationMs: preInfo.durationMs };
    },
  );
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}min${String(s % 60).padStart(2, "0")}s`;
}
