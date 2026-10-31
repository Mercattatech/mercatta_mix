import { after } from "next/server";
import { z } from "zod";
import { UserFacingError, ensureUser, issueLoginLink } from "@mercatta/server";
import { handle } from "@/lib/api";
import { clientIp, requireApiAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { loginLinkMail, sendMail } from "@/lib/mailer";

const body = z.object({
  organizationId: z.uuid(),
  email: z.email().max(200),
  role: z.enum(["owner", "editor", "aprovador"]),
});

/**
 * Admin da plataforma: convida uma pessoa por e-mail e vincula à empresa (limite de 3 pessoas é do banco).
 * Cria o usuário (se não existir), vincula e envia um link de acesso que vale 72 h.
 */
export function POST(req: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const input = body.parse(await req.json());
    const db = getDb();
    const org = (await db.query<{ name: string }>("select name from organizations where id = $1", [input.organizationId])).rows[0];
    if (!org) throw new UserFacingError("Empresa não encontrada.");

    const { id: userId, created } = await ensureUser(db, input.email);
    try {
      await db.query("insert into memberships (user_id, organization_id, role) values ($1, $2, $3) on conflict (user_id, organization_id) do update set role = excluded.role", [
        userId,
        input.organizationId,
        input.role,
      ]);
    } catch (e) {
      if (/member_limit_reached/i.test((e as Error).message)) throw new UserFacingError("Esta empresa já tem 3 pessoas. Remova alguém antes de convidar.");
      throw e;
    }

    const link = await issueLoginLink(db, { email: input.email, ip: await clientIp(), purpose: "invite" });
    if (link) {
      const url = `${serverEnv().APP_URL}/auth/verify?token=${encodeURIComponent(link.token)}`;
      const to = input.email.trim().toLowerCase();
      after(async () => {
        try {
          await sendMail(loginLinkMail({ to, link: url, kind: "invite", organizationName: org.name }));
        } catch (e) {
          console.error("[admin] falha ao enviar o convite", e);
        }
      });
    }
    // `invited`: a pessoa recebeu o e-mail agora; `created`: era a primeira vez dela no sistema
    return { userId, invited: link !== null, created };
  });
}
