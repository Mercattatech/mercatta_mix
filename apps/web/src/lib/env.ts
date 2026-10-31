import "server-only";
import { z } from "zod";

const schema = z.object({
  /** Endereço público do site (sem barra no fim). Usado nos links enviados por e-mail. */
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  STORAGE_DRIVER: z.enum(["r2", "local"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./tmp/storage"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  /**
   * Alternativa ao painel Admin → E-mail. `console` só imprime o e-mail no terminal (desenvolvimento).
   * O SMTP cadastrado no painel tem prioridade sobre estas variáveis.
   */
  MAIL_DRIVER: z.enum(["console", "smtp"]).default("console"),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  /** 32 bytes (openssl rand -base64 32). Cifra a senha do SMTP guardada no banco. */
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Lê e valida as variáveis só quando precisa (o build não exige segredos). */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração incompleta do servidor. Confira .env: ${missing}`);
  }
  if (parsed.data.STORAGE_DRIVER === "r2") {
    for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const) {
      if (!parsed.data[k]) throw new Error(`${k} é obrigatória com STORAGE_DRIVER=r2`);
    }
  }
  if (parsed.data.MAIL_DRIVER === "smtp") {
    for (const k of ["SMTP_URL", "MAIL_FROM"] as const) {
      if (!parsed.data[k]) throw new Error(`${k} é obrigatória com MAIL_DRIVER=smtp`);
    }
  }
  cached = { ...parsed.data, APP_URL: parsed.data.APP_URL.replace(/\/+$/, "") };
  return cached;
}
