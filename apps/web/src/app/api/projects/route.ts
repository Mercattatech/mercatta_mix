import { z } from "zod";
import { assertCanWrite } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const body = z.object({
  organizationId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  targetNetworks: z.array(z.enum(["instagram", "tiktok", "youtube_shorts", "facebook", "linkedin"])).max(5).default([]),
});

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireApiUser();
    const input = body.parse(await req.json());
    const db = getDb();
    await assertCanWrite(db, user.id, input.organizationId);
    const r = await db.query<{ id: string }>(
      "insert into projects (organization_id, name, target_networks, created_by) values ($1, $2, $3, $4) returning id",
      [input.organizationId, input.name, input.targetNetworks, user.id],
    );
    return { id: r.rows[0]!.id };
  });
}
