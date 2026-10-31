import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { UserFacingError } from "./errors";
import type { Sql } from "./sql";

/**
 * SMTP universal: o dono da plataforma cadastra qualquer servidor SMTP pelo painel.
 * A senha é cifrada com AES-256-GCM (autenticada: se alguém mexer no valor guardado, a leitura falha)
 * usando uma chave que só existe no ambiente do servidor (SETTINGS_ENCRYPTION_KEY).
 */

const VERSION = "v1";

/** Aceita 32 bytes em base64 (`openssl rand -base64 32`) ou 64 caracteres hexadecimais. */
export function parseEncryptionKey(raw: string | undefined): Buffer {
  const v = raw?.trim();
  if (!v) throw new UserFacingError("Falta a chave SETTINGS_ENCRYPTION_KEY no ambiente do servidor. Gere uma com: openssl rand -base64 32");
  const key = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  if (key.length !== 32) throw new UserFacingError("SETTINGS_ENCRYPTION_KEY inválida: precisa ter 32 bytes (use: openssl rand -base64 32).");
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(blob: string, key: Buffer): string {
  const [version, iv, tag, data] = blob.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new UserFacingError("A senha de e-mail guardada está em formato desconhecido. Cadastre-a de novo.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new UserFacingError("Não foi possível abrir a senha de e-mail guardada (a chave SETTINGS_ENCRYPTION_KEY mudou?). Cadastre a senha de novo.");
  }
}

export type MailSecurity = "starttls" | "ssl";

export interface MailSettingsInput {
  provider: string;
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  /** Vazio/ausente = manter a senha já guardada. */
  password?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  enabled: boolean;
}

/** O que a tela pode ver: nunca inclui a senha, só se existe. */
export interface MailSettingsView {
  provider: string;
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  enabled: boolean;
  updatedAt: Date;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}

/** Configuração pronta para criar o transporte SMTP (com a senha já aberta). Só existe na memória do servidor. */
export interface SmtpConfig {
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
}

interface Row {
  provider: string;
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  password_enc: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  enabled: boolean;
  updated_at: Date;
  last_test_at: Date | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

/** Nomes de exibição e e-mails entram em cabeçalhos: nada de quebra de linha nem aspas (injeção de cabeçalho). */
function clean(label: string, v: string, max: number): string {
  const t = v.trim();
  if (/[\r\n"<>]/.test(t)) throw new UserFacingError(`${label} não pode ter quebra de linha, aspas ou < >.`);
  if (t.length > max) throw new UserFacingError(`${label} é longo demais.`);
  return t;
}

export function validateMailInput(input: MailSettingsInput): MailSettingsInput {
  const host = input.host.trim().toLowerCase();
  if (!HOST_RE.test(host)) throw new UserFacingError("Servidor SMTP inválido. Use só o endereço, por exemplo smtp.gmail.com (sem http:// nem porta).");
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw new UserFacingError("Porta inválida (1 a 65535).");
  if (input.security !== "starttls" && input.security !== "ssl") throw new UserFacingError("Escolha a segurança da conexão: STARTTLS ou SSL/TLS.");
  const username = clean("Usuário", input.username, 320);
  if (!username) throw new UserFacingError("Informe o usuário do SMTP.");
  const fromEmail = clean("E-mail de envio", input.fromEmail, 320).toLowerCase();
  if (!EMAIL_RE.test(fromEmail)) throw new UserFacingError("E-mail de envio inválido.");
  const fromName = clean("Nome de envio", input.fromName, 120) || "Mercatta Mix";
  const replyTo = input.replyTo?.trim() ? clean("E-mail de resposta", input.replyTo, 320).toLowerCase() : null;
  if (replyTo && !EMAIL_RE.test(replyTo)) throw new UserFacingError("E-mail de resposta inválido.");
  const provider = /^[a-z0-9_-]{1,30}$/.test(input.provider) ? input.provider : "custom";
  const password = input.password?.length ? input.password : undefined;
  if (password && (password.length > 500 || /[\r\n]/.test(password))) throw new UserFacingError("Senha inválida.");
  return { provider, host, port: input.port, security: input.security, username, password, fromName, fromEmail, replyTo, enabled: input.enabled };
}

function toView(r: Row): MailSettingsView {
  return {
    provider: r.provider,
    host: r.host,
    port: r.port,
    security: r.security,
    username: r.username,
    hasPassword: r.password_enc.length > 0,
    fromName: r.from_name,
    fromEmail: r.from_email,
    replyTo: r.reply_to,
    enabled: r.enabled,
    updatedAt: r.updated_at,
    lastTestAt: r.last_test_at,
    lastTestOk: r.last_test_ok,
    lastTestError: r.last_test_error,
  };
}

export async function getMailSettings(sql: Sql): Promise<MailSettingsView | null> {
  const r = await sql.query<Row>("select * from mail_settings where id");
  return r.rows[0] ? toView(r.rows[0]) : null;
}

/** Salva (cria ou atualiza). Senha em branco numa atualização mantém a senha antiga. */
export async function saveMailSettings(sql: Sql, rawInput: MailSettingsInput, key: Buffer, userId: string | null): Promise<MailSettingsView> {
  const input = validateMailInput(rawInput);
  const existing = (await sql.query<{ password_enc: string }>("select password_enc from mail_settings where id")).rows[0];
  if (!input.password && !existing) throw new UserFacingError("Informe a senha do SMTP.");
  const passwordEnc = input.password ? encryptSecret(input.password, key) : existing!.password_enc;
  // mudou o servidor/usuário/senha: o resultado do último teste não vale mais
  const r = await sql.query<Row>(
    `insert into mail_settings (id, provider, host, port, security, username, password_enc, from_name, from_email, reply_to, enabled, updated_by)
     values (true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (id) do update set provider = excluded.provider, host = excluded.host, port = excluded.port, security = excluded.security,
       username = excluded.username, password_enc = excluded.password_enc, from_name = excluded.from_name, from_email = excluded.from_email,
       reply_to = excluded.reply_to, enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now(),
       last_test_at = null, last_test_ok = null, last_test_error = null
     returning *`,
    [input.provider, input.host, input.port, input.security, input.username, passwordEnc, input.fromName, input.fromEmail, input.replyTo ?? null, input.enabled, userId],
  );
  return toView(r.rows[0]!);
}

/** Configuração para enviar e-mail agora. `null` = não há SMTP cadastrado (ou está desligado, salvo `includeDisabled`). */
export async function loadSmtpConfig(sql: Sql, key: Buffer, opts: { includeDisabled?: boolean } = {}): Promise<SmtpConfig | null> {
  const row = (await sql.query<Row>(opts.includeDisabled ? "select * from mail_settings where id" : "select * from mail_settings where id and enabled")).rows[0];
  if (!row) return null;
  return {
    host: row.host,
    port: row.port,
    security: row.security,
    username: row.username,
    password: decryptSecret(row.password_enc, key),
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
  };
}

export async function recordMailTest(sql: Sql, ok: boolean, error?: string): Promise<void> {
  await sql.query("update mail_settings set last_test_at = now(), last_test_ok = $1, last_test_error = $2 where id", [ok, ok ? null : (error ?? "Falha desconhecida").slice(0, 300)]);
}

export async function deleteMailSettings(sql: Sql): Promise<void> {
  await sql.query("delete from mail_settings where id");
}
