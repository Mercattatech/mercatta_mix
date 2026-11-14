import { z } from "zod";
import { ensureUser } from "@mercatta/server";
import { handle } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

const body = z.object({ email: z.string().max(200).optional() });

/**
 * Login direto sem senha nem link de e-mail: garante o usuário, vincula à empresa ativa e inicia a sessão imediatamente.
 */
export function POST(req: Request) {
  return handle(async () => {
    const parsed = body.parse(await req.json().catch(() => ({})));
    const rawEmail = parsed.email?.trim() || "grupomercatta@gmail.com";
    const db = getDb();
    const { id: userId } = await ensureUser(db, rawEmail);

    const hasOrg = await db.query<{ id: string }>(
      `select o.id
         from memberships m
         join organizations o on o.id = m.organization_id
        where m.user_id = $1 and o.status = 'active'
        limit 1`,
      [userId],
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
          [orgId, userId],
        );
      }
      await db.query(
        "insert into memberships (organization_id, user_id, role) values ($1, $2, 'owner') on conflict (organization_id, user_id) do nothing",
        [orgId, userId],
      );
    }

    await startSession(userId);
    return { ok: true, redirectTo: "/projects" };
  });
}
