import "server-only";
import nodemailer from "nodemailer";
import { serverEnv } from "./env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Envia e-mail. `MAIL_DRIVER=console` imprime no terminal (dev, sem conta de e-mail);
 * `smtp` usa qualquer provedor SMTP (Resend, Brevo, Amazon SES, Gmail Workspace...) via SMTP_URL.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const env = serverEnv();
  if (env.MAIL_DRIVER === "console") {
    console.log(`\n──── e-mail (modo console) ────\nPara: ${mail.to}\nAssunto: ${mail.subject}\n\n${mail.text}\n───────────────────────────────\n`);
    return;
  }
  const transport = nodemailer.createTransport(env.SMTP_URL!);
  await transport.sendMail({ from: env.MAIL_FROM!, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** E-mail com o link de acesso (login comum ou convite). */
export function loginLinkMail(opts: { to: string; link: string; kind: "login" | "invite"; organizationName?: string }): Mail {
  const invite = opts.kind === "invite";
  const subject = invite ? "Você foi convidado para o Mercatta Mix" : "Seu link para entrar no Mercatta Mix";
  const validity = invite ? "Este link vale por 3 dias e só pode ser usado uma vez." : "Este link vale por 15 minutos e só pode ser usado uma vez.";
  const intro = invite
    ? `Você foi convidado para usar o Mercatta Mix${opts.organizationName ? ` (${opts.organizationName})` : ""}. Clique no botão para entrar.`
    : "Clique no botão para entrar no Mercatta Mix.";
  const ignore = "Se você não pediu este e-mail, pode ignorá-lo: ninguém entra sem clicar no link.";
  const text = `${intro}\n\n${opts.link}\n\n${validity}\n${ignore}\n`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0a12;font-family:Arial,Helvetica,sans-serif;color:#e8e6f2">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
<p style="font-size:22px;font-weight:700;margin:0 0 24px;color:#a78bfa">Mercatta Mix</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 24px">${escapeHtml(intro)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:12px">Entrar</a></p>
<p style="font-size:13px;line-height:1.5;color:#9a97ad;margin:0 0 8px">${escapeHtml(validity)}</p>
<p style="font-size:13px;line-height:1.5;color:#9a97ad;margin:0">${escapeHtml(ignore)}</p>
</div></body></html>`;
  return { to: opts.to, subject, text, html };
}
