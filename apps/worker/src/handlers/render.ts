import path from "node:path";
import { buildTimeline, computeCut, DEFAULT_CAPTION_STYLE, RENDERER_VERSION, type EnergyEnvelope, type TimelineInputPiece } from "@mercatta/core";
import { loadRenderContext, UserFacingError, type JobContext, type RenderPayload, type Sql } from "@mercatta/server";
import { logger, type WorkerDeps } from "../deps";
import { energyEnvelope, probe, renderVariation } from "../media";
import { runTrackedJob } from "./lifecycle";

/** Diferença máxima aceita entre a duração planejada e a do arquivo gerado. */
const MAX_DURATION_DRIFT_MS = 200;

/** Renderiza UMA combinação (um Reel) e confirma o crédito só quando o arquivo está pronto e conferido. */
export async function renderCombination(deps: WorkerDeps, payload: RenderPayload, ctx: JobContext): Promise<void> {
  const org = payload.organizationId;
  const log = logger(deps);

  await runTrackedJob(
    deps,
    {
      organizationId: org,
      jobId: payload.jobId,
      ctx,
      onFinalFailure: async (sql, message) => {
        await sql.query("update renders set status = 'failed', error_pt = $3, finished_at = now() where organization_id = $1 and id = $2 and status <> 'succeeded'", [
          org,
          payload.renderId,
          message,
        ]);
        // devolve o crédito reservado: falha nossa não é cobrada
        await sql.query("select public.release_credits($1, 'render', $2)", [org, payload.renderId]);
        const r = await sql.query<{ project_id: string }>("select project_id from renders where organization_id = $1 and id = $2", [org, payload.renderId]);
        if (r.rows[0]) await markProjectDoneIfComplete(sql, org, r.rows[0].project_id);
      },
    },
    async ({ workDir, progress }) => {
      const rc = await loadRenderContext(deps.db, org, payload.renderId);
      if (rc.render.status === "succeeded") return { renderId: rc.render.id, skipped: "already_done" };
      if (rc.render.status === "canceled") throw new UserFacingError("Este vídeo foi cancelado.");
      if (rc.currentPlanHash !== rc.render.planHash) {
        throw new UserFacingError("Os trechos ou a legenda mudaram depois que este vídeo foi pedido. Gere as combinações de novo.");
      }

      await deps.db.query("update renders set status = 'running', error_pt = null where organization_id = $1 and id = $2", [org, rc.render.id]);

      await progress(5, "Baixando os vídeos");
      const sources: Record<string, string> = {};
      const envelopes = new Map<string, EnergyEnvelope>();
      let n = 0;
      for (const seg of rc.segments) {
        if (sources[seg.source_video_id]) continue;
        const file = path.join(workDir, `src${n++}.mp4`);
        await deps.store.download(seg.pre_key!, file);
        sources[seg.source_video_id] = file;
        envelopes.set(seg.source_video_id, await energyEnvelope(file));
      }

      await progress(30, "Calculando os cortes");
      const pieces: TimelineInputPiece[] = rc.segments.map((seg) => {
        const cut = computeCut(seg.words, seg.start_word_idx, seg.end_word_idx, seg.duration_ms, { envelope: envelopes.get(seg.source_video_id)! });
        return {
          segmentId: seg.id,
          sourceVideoId: seg.source_video_id,
          type: seg.type,
          srcStartMs: cut.srcStartMs,
          srcEndMs: cut.srcEndMs,
          words: seg.words.slice(seg.start_word_idx, seg.end_word_idx + 1),
        };
      });
      const timeline = buildTimeline(pieces);

      await progress(40, "Montando o vídeo");
      const out = path.join(workDir, "final.mp4");
      await renderVariation({
        workDir: path.join(workDir, "render"),
        sources,
        timeline,
        outFile: out,
        captions:
          deps.burnCaptions === false || rc.burnCaptions === false
            ? false
            : { style: { ...DEFAULT_CAPTION_STYLE, ...rc.style }, ...(deps.fontsDir ? { fontsDir: deps.fontsDir } : {}) },
      });

      await progress(85, "Conferindo o resultado");
      const info = await probe(out);
      if (info.width !== 1080 || info.height !== 1920) throw new Error(`Saída com tamanho inesperado: ${info.width}x${info.height}`);
      if (Math.abs(info.durationMs - timeline.totalDurationMs) > MAX_DURATION_DRIFT_MS) {
        throw new Error(`Duração fora do planejado: ${info.durationMs} ms (esperado ${timeline.totalDurationMs} ms)`);
      }

      await progress(90, "Salvando o arquivo");
      const key = `org/${org}/renders/${rc.render.projectId}/${rc.render.code}-${rc.render.planHash.slice(0, 8)}.mp4`;
      const { sizeBytes } = await deps.store.upload(out, key, "video/mp4");

      const meta = {
        rendererVersion: RENDERER_VERSION,
        timeline: { fps: timeline.fps, totalFrames: timeline.totalFrames, pieces: timeline.pieces },
        captionWordCount: timeline.captionWords.length,
        // tempos de cada palavra no vídeo final: permite auditar a sincronia da legenda e refazer o ASS
        captionWords: timeline.captionWords,
      };
      await deps.db.transaction(async (tx) => {
        const asset = (
          await tx.query<{ id: string }>(
            `insert into media_assets (organization_id, kind, r2_key, size_bytes, mime, status)
             values ($1, 'render', $2, $3, 'video/mp4', 'ready')
             on conflict (r2_key) do update set size_bytes = excluded.size_bytes, status = 'ready'
             returning id`,
            [org, key, sizeBytes],
          )
        ).rows[0]!;
        await tx.query(
          `update renders set status = 'succeeded', asset_id = $3, duration_ms = $4, width = $5, height = $6, fps = $7,
                  size_bytes = $8, meta = $9, error_pt = null, finished_at = now()
            where organization_id = $1 and id = $2`,
          [org, rc.render.id, asset.id, info.durationMs, info.width, info.height, info.fps.toFixed(3), sizeBytes, JSON.stringify(meta)],
        );
        await tx.query("select public.commit_credits($1, 'render', $2)", [org, rc.render.id]);
        await tx.query("insert into usage_events (organization_id, kind, qty, ref_type, ref_id) values ($1, 'render', 1, 'render', $2)", [org, rc.render.id]);
        await markProjectDoneIfComplete(tx, org, rc.render.projectId);
      });

      log("render.done", { renderId: rc.render.id, code: rc.render.code, durationMs: info.durationMs, sizeBytes });
      return { renderId: rc.render.id, code: rc.render.code, durationMs: info.durationMs, sizeBytes };
    },
  );
}

/** Projeto vira "done" quando nenhum render dele está pendente. */
async function markProjectDoneIfComplete(sql: Sql, org: string, projectId: string): Promise<void> {
  await sql.query(
    `update projects set status = 'done'
      where organization_id = $1 and id = $2 and status = 'rendering'
        and not exists (select 1 from renders where organization_id = $1 and project_id = $2 and status in ('queued', 'running'))`,
    [org, projectId],
  );
}
