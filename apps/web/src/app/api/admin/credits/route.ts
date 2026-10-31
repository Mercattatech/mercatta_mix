import { z } from "zod";
import { UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

const body = z.object({
  organizationId: z.uuid(),
  amount: z.number().int().min(1).max(100_000),
  note: z.string().trim().max(200).optional(),
});

/** Admin da plataforma: soma créditos à empresa (o livro de créditos só recebe lançamentos). */
export function POST(req: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const input = body.parse(await req.json());
    const db = getDb();
    const org = await db.query("select 1 from organizations where id = $1", [input.organizationId]);
    if (org.rows.length === 0) throw new UserFacingError("Empresa não encontrada.");
    await db.query("insert into credits_ledger (organization_id, delta, reason, note) values ($1, $2, 'grant', $3)", [input.organizationId, input.amount, input.note ?? "Crédito manual"]);
    const bal = await db.query<{ b: string }>("select credit_balance($1) as b", [input.organizationId]);
    return { balance: Number(bal.rows[0]!.b) };
  });
}
