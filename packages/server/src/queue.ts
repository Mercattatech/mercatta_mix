import { PgBoss, type ConstructorOptions } from "pg-boss";
import { z } from "zod";

const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "uuid inválido");

export const QUEUES = {
  processSource: "source-process",
  render: "render-run",
  zip: "zip-build",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const processSourcePayload = z.object({ organizationId: id, jobId: id, sourceVideoId: id, language: z.string().min(2).max(8).default("pt") });
export const renderPayload = z.object({ organizationId: id, jobId: id, renderId: id });
export const zipPayload = z.object({ organizationId: id, jobId: id, projectId: id, renderIds: z.array(id).min(1) });

export type ProcessSourcePayload = z.infer<typeof processSourcePayload>;
export type RenderPayload = z.infer<typeof renderPayload>;
export type ZipPayload = z.infer<typeof zipPayload>;

export const PAYLOAD_SCHEMAS = {
  [QUEUES.processSource]: processSourcePayload,
  [QUEUES.render]: renderPayload,
  [QUEUES.zip]: zipPayload,
} as const;

/** Tentativas automáticas em falhas temporárias (além da primeira). */
export const RETRY_LIMIT = 2;

const QUEUE_OPTIONS: Record<QueueName, { expireInSeconds: number }> = {
  [QUEUES.processSource]: { expireInSeconds: 30 * 60 },
  [QUEUES.render]: { expireInSeconds: 20 * 60 },
  [QUEUES.zip]: { expireInSeconds: 30 * 60 },
};

export interface JobContext {
  bossJobId: string;
  /** 0 na primeira tentativa. */
  retryCount: number;
  /** Última tentativa: se falhar, o job termina como "failed". */
  isFinalAttempt: boolean;
}

export type PayloadOf<Q extends QueueName> = z.infer<(typeof PAYLOAD_SCHEMAS)[Q]>;

/** Fila de jobs sobre pg-boss (Postgres). Cada etapa é um job separado, idempotente, com prioridade por plano. */
export class JobQueue {
  private constructor(private readonly boss: PgBoss) {}

  static async start(options: string | ConstructorOptions): Promise<JobQueue> {
    const boss = new PgBoss(options as ConstructorOptions);
    boss.on("error", (e) => console.error("[pg-boss]", e));
    await boss.start();
    await JobQueue.ensureQueues(boss);
    return new JobQueue(boss);
  }

  /** Para o site/API: só enfileira. Sem supervisão nem agendador (isso é trabalho do worker). */
  static async startPublisher(connectionString: string): Promise<JobQueue> {
    return JobQueue.start({ connectionString, supervise: false, schedule: false, max: 2 } as ConstructorOptions);
  }

  private static async ensureQueues(boss: PgBoss): Promise<void> {
    for (const name of Object.values(QUEUES)) {
      await boss.createQueue(name, {
        retryLimit: RETRY_LIMIT,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: QUEUE_OPTIONS[name].expireInSeconds,
        deleteAfterSeconds: 7 * 24 * 3600,
      });
    }
  }

  /** `singletonKey` = id do job: publicar duas vezes o mesmo job não duplica o trabalho. */
  async publish<Q extends QueueName>(name: Q, payload: z.input<(typeof PAYLOAD_SCHEMAS)[Q]>, opts: { priority?: number } = {}): Promise<void> {
    const data = PAYLOAD_SCHEMAS[name].parse(payload) as { jobId: string };
    await this.boss.send(name, data, { priority: opts.priority ?? 0, singletonKey: data.jobId });
  }

  async work<Q extends QueueName>(
    name: Q,
    handler: (payload: PayloadOf<Q>, ctx: JobContext) => Promise<void>,
    opts: { concurrency?: number } = {},
  ): Promise<void> {
    await this.boss.work(name, { localConcurrency: opts.concurrency ?? 1, pollingIntervalSeconds: 2 }, async ([job]) => {
      if (!job) return;
      const payload = PAYLOAD_SCHEMAS[name].parse(job.data) as PayloadOf<Q>;
      await handler(payload, {
        bossJobId: job.id,
        retryCount: job.retryCount,
        isFinalAttempt: job.retryCount >= RETRY_LIMIT,
      });
    });
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }

  /** Para testes e diagnóstico. */
  get raw(): PgBoss {
    return this.boss;
  }
}
