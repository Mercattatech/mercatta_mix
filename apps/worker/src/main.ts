import path from "node:path";
import pg from "pg";
import { fromPgPool, JobQueue, QUEUES } from "@mercatta/server";
import { loadConfig } from "./config";
import type { WorkerDeps } from "./deps";
import { renderCombination } from "./handlers/render";
import { processSource } from "./handlers/process-source";
import { buildZip } from "./handlers/zip";
import { LocalObjectStore, R2ObjectStore, type ObjectStore } from "./store";
import { FasterWhisperTranscriber, OpenAiWhisperTranscriber, type Transcriber } from "./transcriber";
import { hasAssFilter } from "./media";

async function main() {
  const cfg = loadConfig();

  const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: 6 });
  const store: ObjectStore =
    cfg.STORAGE_DRIVER === "r2"
      ? new R2ObjectStore({ accountId: cfg.R2_ACCOUNT_ID!, accessKeyId: cfg.R2_ACCESS_KEY_ID!, secretAccessKey: cfg.R2_SECRET_ACCESS_KEY!, bucket: cfg.R2_BUCKET! })
      : new LocalObjectStore(path.resolve(cfg.LOCAL_STORAGE_DIR));
  const transcriber: Transcriber = cfg.TRANSCRIBER === "openai" ? new OpenAiWhisperTranscriber(cfg.OPENAI_API_KEY!) : new FasterWhisperTranscriber();

  const hasLibass = await hasAssFilter();
  if (!hasLibass) {
    console.log(JSON.stringify({ msg: "worker.info", note: "FFmpeg sem libass; usando motor de legenda via overlay PNG (Pillow)." }));
  }

  const deps: WorkerDeps = {
    db: fromPgPool(pool),
    store,
    transcriber,
    tmpRoot: path.resolve(cfg.TMP_DIR),
    burnCaptions: true,
    ...(cfg.FONTS_DIR ? { fontsDir: cfg.FONTS_DIR } : {}),
  };

  const queue = await JobQueue.start(cfg.DATABASE_URL);
  await queue.work(QUEUES.processSource, (p, ctx) => processSource(deps, p, ctx), { concurrency: cfg.WORKER_CONCURRENCY });
  await queue.work(QUEUES.render, (p, ctx) => renderCombination(deps, p, ctx), { concurrency: cfg.WORKER_CONCURRENCY });
  await queue.work(QUEUES.zip, (p, ctx) => buildZip(deps, p, ctx), { concurrency: 1 });
  console.log(JSON.stringify({ msg: "worker.started", storage: cfg.STORAGE_DRIVER, transcriber: `${transcriber.provider}:${transcriber.model}`, concurrency: cfg.WORKER_CONCURRENCY }));

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ msg: "worker.stopping", signal }));
    await queue.stop();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
