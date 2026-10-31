import { z } from "zod";
import { deleteMailSettings, getMailSettings, parseEncryptionKey, saveMailSettings } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";

const body = z.object({
  provider: z.string().max(30).default("custom"),
  host: z.string().max(253),
  port: z.number().int().min(1).max(65535),
  security: z.enum(["starttls", "ssl"]),
  username: z.string().min(1).max(320),
  password: z.string().max(500).optional(),
  fromName: z.string().max(120),
  fromEmail: z.string().max(320),
  replyTo: z.string().max(320).nullish(),
  enabled: z.boolean().default(true),
});

/** Admin da plataforma: configuração atual (a senha nunca sai do servidor). */
export function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return { settings: await getMailSettings(getDb()) };
  });
}

/** Admin da plataforma: salva o SMTP. Senha em branco = mantém a atual. */
export function PUT(req: Request) {
  return handle(async () => {
    const admin = await requireApiAdmin();
    const input = body.parse(await req.json());
    const key = parseEncryptionKey(serverEnv().SETTINGS_ENCRYPTION_KEY);
    return { settings: await saveMailSettings(getDb(), input, key, admin.id) };
  });
}

/** Admin da plataforma: remove o SMTP do painel (volta a valer o .env). */
export function DELETE() {
  return handle(async () => {
    await requireApiAdmin();
    await deleteMailSettings(getDb());
    return { ok: true };
  });
}
