import { z } from "zod";
import { UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

const body = z.object({
  name: z.string().trim().min(2).max(120),
  initialCredits: z.number().int().min(0).max(100_000).default(0),
});

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base.length >= 2 ? base : `empresa-${Date.now().toString(36)}`;
}

/** Admin da plataforma: cria uma empresa cliente (acesso por convite) e, se quiser, já dá créditos. */
export function POST(req: Request) {
  return handle(async () => {
    const admin = await requireApiAdmin();
    const input = body.parse(await req.json());
    const db = getDb();
    return db.transaction(async (tx) => {
      const base = slugify(input.name);
      let slug = base;
      for (let i = 2; (await tx.query("select 1 from organizations where slug = $1", [slug])).rows.length > 0; i++) {
        slug = `${base}-${i}`.slice(0, 63);
        if (i > 50) throw new UserFacingError("Não foi possível gerar um endereço único para a empresa.");
      }
      const org = (await tx.query<{ id: string }>("insert into organizations (name, slug) values ($1, $2) returning id", [input.name, slug])).rows[0]!;
      if (input.initialCredits > 0) {
        await tx.query("insert into credits_ledger (organization_id, delta, reason, note) values ($1, $2, 'grant', 'Créditos iniciais')", [org.id, input.initialCredits]);
      }
      await tx.query(
        "insert into memberships (user_id, organization_id, role) values ($1, $2, 'owner') on conflict do nothing",
        [admin.id, org.id],
      );
      return { id: org.id, slug };
    });
  });
}
