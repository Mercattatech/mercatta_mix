import { createHash, randomBytes } from "node:crypto";
import { UserFacingError } from "./errors";
import type { Sql } from "./sql";

/**
 * Login por link mágico + sessões, direto no Postgres (sem serviço externo de autenticação).
 *
 * Segurança:
 *  - tokens aleatórios de 256 bits; no banco só vai o hash SHA-256 (um vazamento do banco não dá acesso);
 *  - link de uso único e com validade curta (consumo atômico: `update ... where used_at is null returning`);
 *  - acesso só por convite: e-mail desconhecido nunca cria conta e a resposta é a mesma (não revela quem tem conta);
 *  - freio por IP (qualquer e-mail) e por pessoa (5 links por hora).
 */

export const LOGIN_LINK_TTL_MS = 15 * 60_000;
export const INVITE_LINK_TTL_MS = 72 * 3_600_000;
export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
const MAX_ATTEMPTS_PER_IP = 20; // por 15 min
const MAX_LINKS_PER_USER = 5; // por hora
const SESSION_TOUCH_AFTER_MS = 10 * 60_000;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (e.length > 200 || !EMAIL_RE.test(e)) throw new UserFacingError("Digite um e-mail válido.");
  return e;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/** Cria o usuário se ainda não existe (usado no convite e no script de admin). */
export async function ensureUser(sql: Sql, email: string, name?: string): Promise<{ id: string; created: boolean }> {
  const e = normalizeEmail(email);
  const inserted = await sql.query<{ id: string }>("insert into users (email, name) values ($1, $2) on conflict (email) do nothing returning id", [e, name ?? null]);
  if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };
  const existing = await sql.query<{ id: string }>("select id from users where email = $1", [e]);
  return { id: existing.rows[0]!.id, created: false };
}

/**
 * Gera um link de acesso para um e-mail JÁ cadastrado. Devolve `null` (sem erro) quando não há conta ou o limite da pessoa
 * foi atingido — quem chama responde sempre a mesma mensagem. Estoura `UserFacingError` só para e-mail inválido ou IP abusivo.
 */
export async function issueLoginLink(sql: Sql, opts: { email: string; ip: string; purpose?: "login" | "invite" }): Promise<{ token: string; userId: string; expiresAt: Date } | null> {
  const email = normalizeEmail(opts.email);
  const purpose = opts.purpose ?? "login";

  // limpeza oportunista: dispensa um agendador só para isso
  await sql.query("delete from login_attempts where created_at < now() - interval '1 day'");
  await sql.query("delete from login_tokens where expires_at < now() - interval '1 day'");
  await sql.query("delete from sessions where expires_at < now()");

  await sql.query("insert into login_attempts (ip) values ($1)", [opts.ip]);
  const attempts = await sql.query<{ n: number }>("select count(*)::int as n from login_attempts where ip = $1 and created_at > now() - interval '15 minutes'", [opts.ip]);
  if (attempts.rows[0]!.n > MAX_ATTEMPTS_PER_IP) throw new UserFacingError("Muitas tentativas. Aguarde alguns minutos e tente de novo.");

  const user = (await sql.query<{ id: string }>("select id from users where email = $1", [email])).rows[0];
  if (!user) return null;

  const recent = await sql.query<{ n: number }>("select count(*)::int as n from login_tokens where user_id = $1 and created_at > now() - interval '1 hour'", [user.id]);
  if (recent.rows[0]!.n >= MAX_LINKS_PER_USER) return null;

  const token = newToken();
  const expiresAt = new Date(Date.now() + (purpose === "invite" ? INVITE_LINK_TTL_MS : LOGIN_LINK_TTL_MS));
  await sql.query("insert into login_tokens (user_id, token_hash, purpose, expires_at) values ($1, $2, $3, $4)", [user.id, hashToken(token), purpose, expiresAt.toISOString()]);
  return { token, userId: user.id, expiresAt };
}

/** Troca o link por um usuário. Uso único: a segunda tentativa (ou link vencido) devolve `null`. */
export async function consumeLoginLink(sql: Sql, token: string): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const r = await sql.query<{ user_id: string }>(
    "update login_tokens set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id",
    [hashToken(token)],
  );
  return r.rows[0]?.user_id ?? null;
}

export async function createSession(sql: Sql, userId: string, userAgent?: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sql.query("insert into sessions (user_id, token_hash, expires_at, user_agent) values ($1, $2, $3, $4)", [userId, hashToken(token), expiresAt.toISOString(), userAgent?.slice(0, 300) ?? null]);
  return { token, expiresAt };
}

/** Quem é o dono do cookie de sessão (ou `null` se não existe/venceu). Renova `last_seen_at` no máximo a cada 10 min. */
export async function findSession(sql: Sql, token: string): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const hash = hashToken(token);
  const r = await sql.query<SessionUser & { stale: boolean }>(
    `select u.id, u.email, u.name, s.last_seen_at < now() - ($2 || ' milliseconds')::interval as stale
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hash, String(SESSION_TOUCH_AFTER_MS)],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.stale) await sql.query("update sessions set last_seen_at = now() where token_hash = $1", [hash]);
  return { id: row.id, email: row.email, name: row.name };
}

export async function deleteSession(sql: Sql, token: string): Promise<void> {
  if (!token) return;
  await sql.query("delete from sessions where token_hash = $1", [hashToken(token)]);
}
