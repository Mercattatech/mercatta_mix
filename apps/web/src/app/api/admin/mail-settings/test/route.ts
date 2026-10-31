import { z } from "zod";
import { UserFacingError, loadSmtpConfig, parseEncryptionKey, recordMailTest } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { explainMailError, sendMailWith, testMail } from "@/lib/mailer";

const body = z.object({ to: z.string().max(320).optional() });

/** Admin da plataforma: envia um e-mail de teste com o SMTP SALVO (mesmo desligado) e guarda o resultado. */
export function POST(req: Request) {
  return handle(async () => {
    const admin = await requireApiAdmin();
    const input = body.parse(await req.json().catch(() => ({})));
    const to = (input.to?.trim() || admin.email).toLowerCase();
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(to)) throw new UserFacingError("Digite um e-mail válido para receber o teste.");

    const db = getDb();
    // o teste usa a configuração salva, inclusive se estiver desligada
    const key = parseEncryptionKey(serverEnv().SETTINGS_ENCRYPTION_KEY);
    const cfg = await loadSmtpConfig(db, key, { includeDisabled: true });
    if (!cfg) throw new UserFacingError("Salve a configuração antes de testar.");

    try {
      await sendMailWith(cfg, testMail(to));
    } catch (e) {
      const message = explainMailError(e, cfg);
      await recordMailTest(db, false, message);
      throw new UserFacingError(message);
    }
    await recordMailTest(db, true);
    return { ok: true, to };
  });
}
