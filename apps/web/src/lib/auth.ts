import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ForbiddenError, assertCanRead, assertCanWrite, createSession, deleteSession, ensureUser, findSession, type SessionUser } from "@mercatta/server";
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

async function ensureDefaultSessionUser(): Promise<SessionUser> {
  const db = getDb();
  const existing = await db.query<SessionUser>(
    `select u.id, u.email, u.name
       from users u
       left join platform_admins pa on pa.user_id = u.id
      order by (pa.user_id is not null) desc, u.created_at asc
      limit 1`,
  );
  let user = existing.rows[0];
  if (!user) {
    const created = await ensureUser(db, "grupomercatta@gmail.com", "Mercatta");
    await db.query("insert into platform_admins (user_id) values ($1) on conflict (user_id) do nothing", [created.id]);
    user = { id: created.id, email: "grupomercatta@gmail.com", name: "Mercatta" };
  } else {
    await db.query("insert into platform_admins (user_id) values ($1) on conflict (user_id) do nothing", [user.id]);
  }

  const hasOrg = await db.query<{ id: string }>(
    `select o.id
       from memberships m
       join organizations o on o.id = m.organization_id
      where m.user_id = $1 and o.status = 'active'
      limit 1`,
    [user.id],
  );
  if (!hasOrg.rows[0]) {
    const firstOrg = await db.query<{ id: string }>(
      "select id from organizations where status = 'active' order by created_at asc limit 1",
    );
    let orgId = firstOrg.rows[0]?.id;
    if (!orgId) {
      const newOrg = await db.query<{ id: string }>(
        "insert into organizations (name, status) values ('Mercatta', 'active') returning id",
      );
      orgId = newOrg.rows[0]!.id;
      await db.query(
        "insert into credit_ledger (organization_id, delta, kind, note, created_by) values ($1, 1000, 'grant', 'Saldo inicial', $2)",
        [orgId, user.id],
      );
    }
    await db.query(
      "insert into memberships (organization_id, user_id, role) values ($1, $2, 'owner') on conflict (organization_id, user_id) do nothing",
      [orgId, user.id],
    );
  }
  return user;
}

/** Quem está logado nesta requisição (se não houver cookie válido, autentica automaticamente o usuário padrão). */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const sessionUser = await findSession(getDb(), token);
    if (sessionUser) return sessionUser;
  }
  return ensureDefaultSessionUser();
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
