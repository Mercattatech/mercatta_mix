import "server-only";
import nodemailer from "nodemailer";
import { UserFacingError, getMailSettings, loadSmtpConfig, parseEncryptionKey, type SmtpConfig } from "@mercatta/server";
import { getDb } from "./db";
import { serverEnv } from "./env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Transporte SMTP a partir da configuração do painel. Tempos curtos: a página não pode ficar presa num servidor fora do ar. */
function transportFor(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === "ssl",
    requireTLS: cfg.security === "starttls",
    auth: { user: cfg.username, pass: cfg.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** Envia com uma configuração específica (usado também pelo botão "Enviar teste" do painel). */
export async function sendMailWith(cfg: SmtpConfig, mail: Mail): Promise<void> {
  await transportFor(cfg).sendMail({
    from: { name: cfg.fromName, address: cfg.fromEmail },
    ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

/**
 * Traduz o erro técnico do SMTP para algo que o dono entende e consegue resolver.
 * (Nunca devolve a senha: o nodemailer não a inclui nas mensagens.)
 */
export function explainMailError(e: unknown, cfg: Pick<SmtpConfig, "host" | "port">): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const gmail = /gmail|googlemail/i.test(cfg.host);
  if (err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534) {
    return gmail
      ? "O Google recusou o usuário/senha. O Gmail não aceita a senha normal da conta por SMTP: ative a verificação em duas etapas e crie uma \"senha de app\" em myaccount.google.com/apppasswords."
      : "O servidor recusou o usuário ou a senha. Confira os dados (alguns provedores pedem uma senha/chave de API própria para SMTP).";
  }
  if (err.code === "EDNS" || err.code === "ENOTFOUND") return `Não encontramos o servidor "${cfg.host}". Confira o endereço.`;
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET" || err.code === "ECONNREFUSED") {
    return `Não foi possível conectar em ${cfg.host}:${cfg.port}. Confira a porta e a segurança (587 costuma ser STARTTLS, 465 costuma ser SSL/TLS) e se a rede/VPS libera a saída por essa porta.`;
  }
  if (err.code === "EENVELOPE" || err.responseCode === 550 || err.responseCode === 553) {
    return "O servidor recusou o remetente ou o destinatário. O \"e-mail de envio\" precisa ser da conta (ou um endereço autorizado no provedor).";
  }
  return `Falha ao enviar: ${(err.message ?? "erro desconhecido").slice(0, 200)}`;
}

/**
 * Envia e-mail. Ordem de escolha:
 *  1. SMTP cadastrado no painel Admin → E-mail (senha cifrada no banco);
 *  2. variáveis de ambiente: `MAIL_DRIVER=smtp` (SMTP_URL) ou `console` (imprime no terminal, só desenvolvimento).
 */
export async function sendMail(mail: Mail): Promise<void> {
  const env = serverEnv();
  const row = await getMailSettings(getDb());
  if (row?.enabled) {
    const cfg = await loadSmtpConfig(getDb(), parseEncryptionKey(env.SETTINGS_ENCRYPTION_KEY));
    if (cfg) return sendMailWith(cfg, mail);
  }
  if (env.MAIL_DRIVER === "smtp") {
    const transport = nodemailer.createTransport(env.SMTP_URL!);
    await transport.sendMail({ from: env.MAIL_FROM!, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new UserFacingError("Nenhum e-mail configurado: cadastre o SMTP em Admin → E-mail. Sem isso o link de acesso não chega às pessoas.");
  }
  console.log(`\n──── e-mail (modo console) ────\nPara: ${mail.to}\nAssunto: ${mail.subject}\n\n${mail.text}\n───────────────────────────────\n`);
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

/** E-mail de teste do painel: confirma que a configuração funciona de ponta a ponta. */
export function testMail(to: string): Mail {
  const text = "Se você recebeu esta mensagem, o envio de e-mails do Mercatta Mix está funcionando.\n";
  return {
    to,
    subject: "Teste de e-mail — Mercatta Mix",
    text,
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif"><p>${escapeHtml(text)}</p></body></html>`,
  };
}
