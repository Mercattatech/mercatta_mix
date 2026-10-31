import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ForbiddenError, assertCanRead, assertCanWrite } from "@mercatta/server";
import { getDb } from "./db";
import { serverEnv } from "./env";

/** Cliente do Supabase com a sessão do usuário (cookies): as consultas obedecem à RLS. */
export async function supabaseForUser() {
  const store = await cookies();
  return createServerClient(serverEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // chamado de um Server Component: o proxy já renova a sessão
        }
      },
    },
  });
}

/** Cliente administrativo (ignora a RLS). Só em rotas de servidor, depois de checar permissão. */
export function supabaseAdmin() {
  return createAdminClient(serverEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export interface SessionUser {
  id: string;
  email: string;
}

export async function currentUser(): Promise<SessionUser | null> {
  const { data } = await (await supabaseForUser()).auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
}

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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
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
