import { after } from "next/server";
import { z } from "zod";
import { issueLoginLink } from "@mercatta/server";
import { handle } from "@/lib/api";
import { clientIp } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { loginLinkMail, sendMail } from "@/lib/mailer";

const body = z.object({ email: z.string().max(200) });

/**
 * Pede o link de acesso. A resposta é SEMPRE a mesma, exista ou não a conta, e o e-mail é enviado depois de responder
 * (assim nem o tempo da resposta revela quem tem conta). Quem não foi convidado não recebe nada.
 */
export function POST(req: Request) {
  return handle(async () => {
    const { email } = body.parse(await req.json());
    const link = await issueLoginLink(getDb(), { email, ip: await clientIp() });
    if (link) {
      const url = `${serverEnv().APP_URL}/auth/verify?token=${encodeURIComponent(link.token)}`;
      const to = email.trim().toLowerCase();
      after(async () => {
        try {
          await sendMail(loginLinkMail({ to, link: url, kind: "login" }));
        } catch (e) {
          console.error("[auth] falha ao enviar o link de acesso", e);
        }
      });
    }
    return { ok: true };
  });
}
