import { z } from "zod";
import { deleteInstagramAccount, listInstagramAccounts, upsertInstagramAccount, UserFacingError } from "@mercatta/server";
import { handle } from "@/lib/api";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";

const createBody = z.object({
  name: z.string().min(1).max(120).optional(),
  igUserId: z.string().max(120).optional(),
  accessToken: z.string().max(2000).optional(),
  username: z.string().max(120).optional().nullable(),
  verifyWithMeta: z.boolean().optional(),
});

const deleteBody = z.object({
  accountId: z.uuid(),
});

export function GET() {
  return handle(async () => {
    const ctx = await getAppContext();
    if (!ctx.organization) throw new UserFacingError("Sua conta ainda não está vinculada a uma empresa.");
    const accounts = await listInstagramAccounts(getDb(), ctx.organization.id);
    return { accounts };
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const ctx = await getAppContext();
    if (!ctx.organization) throw new UserFacingError("Sua conta ainda não está vinculada a uma empresa.");
    const input = createBody.parse(await req.json());
    const cleanUser = (input.username || input.name || "mercatta.oficial").trim().replace(/^@/, "");
    const account = await upsertInstagramAccount(
      getDb(),
      {
        organizationId: ctx.organization.id,
        name: input.name?.trim() || `@${cleanUser}`,
        ...(input.igUserId ? { igUserId: input.igUserId } : {}),
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
        username: cleanUser,
        ...(input.verifyWithMeta !== undefined ? { verifyWithMeta: input.verifyWithMeta } : {}),
      },
      serverEnv().SETTINGS_ENCRYPTION_KEY,
    );
    return { account };
  });
}

export function DELETE(req: Request) {
  return handle(async () => {
    const ctx = await getAppContext();
    if (!ctx.organization) throw new UserFacingError("Sua conta ainda não está vinculada a uma empresa.");
    const input = deleteBody.parse(await req.json());
    await deleteInstagramAccount(getDb(), ctx.organization.id, input.accountId);
    return { ok: true };
  });
}
