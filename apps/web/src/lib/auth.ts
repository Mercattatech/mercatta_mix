import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ForbiddenError, assertCanRead, assertCanWrite, createSession, deleteSession, findSession, type SessionUser } from "@mercatta/server";
import { getDb } from "./db";
import { serverEnv } from "./env";

export type { SessionUser };

export const SESSION_COOKIE = "mm_session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Quem está logado nesta requisição (uma consulta por requisição, nos Server Components). */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findSession(getDb(), token);
});

/** Para páginas: manda para o login se não houver sessão. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para a API: 401 se não houver sessão. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Sua sessão expirou. Entre de novo.");
  return user;
}

/** Abre a sessão e grava o cookie (httpOnly: o JavaScript da página nunca enxerga o token). */
export async function startSession(userId: string): Promise<void> {
  const userAgent = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(getDb(), userId, userAgent);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

/** Encerra a sessão no banco e apaga o cookie. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(getDb(), token);
  store.delete(SESSION_COOKIE);
}

/** IP de quem fez o pedido (atrás de proxy/Vercel o cabeçalho é preenchido pela própria infraestrutura). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const r = await getDb().query<{ ok: boolean }>("select exists(select 1 from platform_admins where user_id = $1) as ok", [userId]);
  return r.rows[0]?.ok === true;
}

export async function requireApiAdmin(): Promise<SessionUser> {
  const user = await requireApiUser();
  if (!(await isPlatformAdmin(user.id))) throw new ForbiddenError();
  return user;
}

/** Empresa do projeto + checagem de permissão (as mesmas regras da RLS). */
export async function projectAccess(userId: string, projectId: string, mode: "read" | "write"): Promise<{ organizationId: string }> {
  const db = getDb();
  const r = await db.query<{ organization_id: string }>("select organization_id from projects where id = $1", [projectId]);
  const org = r.rows[0]?.organization_id;
  // mesma resposta para "não existe" e "não é seu": não revela a existência de projetos de outras empresas
  if (!org) throw new ForbiddenError();
  if (mode === "write") await assertCanWrite(db, userId, org);
  else await assertCanRead(db, userId, org);
  return { organizationId: org };
}
