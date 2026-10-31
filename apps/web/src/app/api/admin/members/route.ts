import { z } from "zod";
import { UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiAdmin, supabaseAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

const body = z.object({
  organizationId: z.uuid(),
  email: z.email().max(200),
  role: z.enum(["owner", "editor", "aprovador"]),
});

/** Admin da plataforma: convida uma pessoa por e-mail e vincula à empresa (limite de 3 pessoas é do banco). */
export function POST(req: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const input = body.parse(await req.json());
    const db = getDb();
    const org = await db.query("select 1 from organizations where id = $1", [input.organizationId]);
    if (org.rows.length === 0) throw new UserFacingError("Empresa não encontrada.");

    const admin = supabaseAdmin();
    const email = input.email.toLowerCase();
    const existing = await db.query<{ id: string }>("select id from auth.users where lower(email) = $1", [email]);
    let userId = existing.rows[0]?.id;
    let invited = false;
    if (!userId) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error || !data.user) throw new UserFacingError("Não foi possível enviar o convite. Confira o e-mail e tente de novo.");
      userId = data.user.id;
      invited = true;
    }
    try {
      await db.query("insert into memberships (user_id, organization_id, role) values ($1, $2, $3) on conflict (user_id, organization_id) do update set role = excluded.role", [
        userId,
        input.organizationId,
        input.role,
      ]);
    } catch (e) {
      if (/limit|limite|3/i.test((e as Error).message)) throw new UserFacingError("Esta empresa já tem 3 pessoas. Remova alguém antes de convidar.");
      throw e;
    }
    return { userId, invited };
  });
}
