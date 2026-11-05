import { z } from "zod";
import { handle } from "@/lib/api";
import { projectAccess, requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const body = z.object({
  editingInstructions: z.string().max(2000).optional(),
  useBrolls: z.boolean().optional(),
  burnCaptions: z.boolean().optional(),
  captionStyle: z
    .object({
      fontName: z.string().max(80).optional(),
      fontSize: z.number().int().min(20).max(160).optional(),
      highlightColor: z.string().max(20).optional(),
      mode: z.enum(["karaoke", "static"]).optional(),
      position: z.enum(["top", "middle", "bottom"]).optional(),
    })
    .optional(),
});

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const { organizationId } = await projectAccess(user.id, projectId, "write");
    const input = body.parse(await req.json());
    const db = getDb();

    const current = (
      await db.query<{ settings: Record<string, unknown>; editing_instructions: string | null }>(
        "select settings, editing_instructions from projects where organization_id = $1 and id = $2",
        [organizationId, projectId],
      )
    ).rows[0];

    const currentSettings = current?.settings ?? {};
    const newSettings = {
      ...currentSettings,
      ...(input.useBrolls !== undefined ? { use_b_rolls: input.useBrolls } : {}),
      ...(input.burnCaptions !== undefined ? { burn_captions: input.burnCaptions } : {}),
      ...(input.captionStyle !== undefined
        ? {
            caption_style: {
              ...((currentSettings.caption_style as Record<string, unknown>) ?? {}),
              ...input.captionStyle,
            },
          }
        : {}),
    };

    const newInstructions = input.editingInstructions !== undefined ? input.editingInstructions : current?.editing_instructions;

    await db.query(
      "update projects set settings = $1, editing_instructions = $2, updated_at = now() where organization_id = $3 and id = $4",
      [JSON.stringify(newSettings), newInstructions, organizationId, projectId],
    );

    return { ok: true, settings: newSettings, editingInstructions: newInstructions };
  });
}

