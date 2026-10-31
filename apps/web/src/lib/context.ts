import "server-only";
import { cache } from "react";
import { isPlatformAdmin, requireUser, type SessionUser } from "./auth";
import { getDb } from "./db";

export interface AppContext {
  user: SessionUser;
  isAdmin: boolean;
  organization: { id: string; name: string; role: string } | null;
  credits: number | null;
}

/** Quem é o usuário, qual empresa está ativa e quantos créditos ela tem. Uma consulta por requisição. */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const user = await requireUser();
  const db = getDb();
  const m = await db.query<{ id: string; name: string; role: string }>(
    `select o.id, o.name, m.role
       from memberships m join organizations o on o.id = m.organization_id
      where m.user_id = $1 and o.status = 'active'
      order by m.created_at asc limit 1`,
    [user.id],
  );
  const organization = m.rows[0] ?? null;

  let credits: number | null = null;
  if (organization) {
    const bal = await db.query<{ b: string }>("select credit_balance($1) as b", [organization.id]);
    credits = Number(bal.rows[0]?.b ?? 0);
  }
  return { user, isAdmin: await isPlatformAdmin(user.id), organization, credits };
});
