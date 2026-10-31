import { z } from "zod";

/** Variáveis de ambiente do worker. Nenhum valor secreto tem padrão: se faltar, o processo avisa e não sobe. */
const schema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória (conexão direta/session do Postgres, não o pooler de transações)"),
    STORAGE_DRIVER: z.enum(["r2", "local"]).default("r2"),
    LOCAL_STORAGE_DIR: z.string().default("./tmp/storage"),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    TRANSCRIBER: z.enum(["faster-whisper", "openai"]).default("faster-whisper"),
    OPENAI_API_KEY: z.string().optional(),
    TMP_DIR: z.string().default("./tmp/work"),
    FONTS_DIR: z.string().optional(),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "r2") {
      for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const) {
        if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: `${k} é obrigatória com STORAGE_DRIVER=r2` });
      }
    }
    if (env.TRANSCRIBER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "OPENAI_API_KEY é obrigatória com TRANSCRIBER=openai" });
    }
  });

export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Configuração inválida:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
