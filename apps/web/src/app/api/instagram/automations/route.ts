import { z } from "zod";
import {
  deleteInstagramAutomation,
  executeAutomationFlowStep,
  listInstagramAutomationSessions,
  listInstagramAutomations,
  syncAndReplyRecentInstagramComments,
  toggleInstagramAutomationStatus,
  upsertInstagramAutomation,
} from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";

const upsertSchema = z.object({
  intent: z.literal("upsert"),
  id: z.uuid().optional(),
  instagramAccountId: z.uuid(),
  projectId: z.uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  status: z.enum(["active", "paused"]).optional(),
  triggerType: z.enum(["comment", "dm", "story_reply", "any"]).default("comment"),
  mediaScope: z.enum(["all_media", "specific_media", "project_media"]).default("all_media"),
  targetMediaIds: z.array(z.string()).optional(),
  matchMode: z.enum(["contains", "exact", "any_comment"]).default("contains"),
  keywords: z.array(z.string()).default([]),
  replyToComment: z.boolean().default(true),
  commentReplies: z.array(z.string()).default([]),
  requireFollow: z.boolean().default(true),
  followGateMessage: z.string().default(""),
  followGateButtonLabel: z.string().optional(),
  notFollowingMessage: z.string().default(""),
  collectLeadField: z.enum(["none", "email", "whatsapp"]).default("none"),
  collectLeadPrompt: z.string().optional(),
  dmMessage: z.string().min(1),
  dmButtonTitle: z.string().optional(),
  dmButtonUrl: z.string().optional(),
});

const actionSchema = z.discriminatedUnion("intent", [
  upsertSchema,
  z.object({
    intent: z.literal("toggle_status"),
    automationId: z.uuid(),
    status: z.enum(["active", "paused"]),
  }),
  z.object({
    intent: z.literal("delete"),
    automationId: z.uuid(),
  }),
  z.object({
    intent: z.literal("simulate"),
    automationId: z.uuid(),
    igUsername: z.string().default("cliente.teste"),
    inputText: z.string().default("EU QUERO"),
    isFollowing: z.boolean().default(false),
    action: z.enum(["trigger", "check_follow", "submit_lead"]).default("trigger"),
    sessionId: z.uuid().optional(),
  }),
  z.object({
    intent: z.literal("sync_comments"),
    instagramAccountId: z.uuid().optional(),
  }),
]);

export function GET() {
  return handle(async () => {
    await requireApiUser();
    const ctx = await getAppContext();
    if (!ctx.organization) return { automations: [], sessions: [] };
    const db = getDb();
    const [automations, sessions] = await Promise.all([
      listInstagramAutomations(db, ctx.organization.id),
      listInstagramAutomationSessions(db, ctx.organization.id, 60),
    ]);
    return { automations, sessions };
  });
}

export function POST(req: Request) {
  return handle(async () => {
    await requireApiUser();
    const ctx = await getAppContext();
    if (!ctx.organization) throw new Error("Organização não encontrada.");
    const orgId = ctx.organization.id;
    const db = getDb();
    const body = actionSchema.parse(await req.json());

    if (body.intent === "upsert") {
      const automation = await upsertInstagramAutomation(db, {
        ...(body.id ? { id: body.id } : {}),
        organizationId: orgId,
        instagramAccountId: body.instagramAccountId,
        projectId: body.projectId ?? null,
        name: body.name,
        ...(body.status ? { status: body.status } : {}),
        triggerType: body.triggerType,
        mediaScope: body.mediaScope,
        ...(body.targetMediaIds ? { targetMediaIds: body.targetMediaIds } : {}),
        matchMode: body.matchMode,
        keywords: body.keywords,
        replyToComment: body.replyToComment,
        commentReplies: body.commentReplies,
        requireFollow: body.requireFollow,
        followGateMessage: body.followGateMessage,
        ...(body.followGateButtonLabel ? { followGateButtonLabel: body.followGateButtonLabel } : {}),
        notFollowingMessage: body.notFollowingMessage,
        collectLeadField: body.collectLeadField,
        ...(body.collectLeadPrompt !== undefined ? { collectLeadPrompt: body.collectLeadPrompt } : {}),
        dmMessage: body.dmMessage,
        ...(body.dmButtonTitle !== undefined ? { dmButtonTitle: body.dmButtonTitle } : {}),
        ...(body.dmButtonUrl !== undefined ? { dmButtonUrl: body.dmButtonUrl } : {}),
      });
      return { automation };
    }

    if (body.intent === "toggle_status") {
      await toggleInstagramAutomationStatus(db, orgId, body.automationId, body.status);
      return { ok: true };
    }

    if (body.intent === "delete") {
      await deleteInstagramAutomation(db, orgId, body.automationId);
      return { ok: true };
    }

    if (body.intent === "simulate") {
      const result = await executeAutomationFlowStep(db, {
        organizationId: orgId,
        automationId: body.automationId,
        igSenderId: `sim_${body.igUsername.replace(/^@/, "")}`,
        igUsername: body.igUsername.replace(/^@/, ""),
        igName: body.igUsername.replace(/^@/, ""),
        sourceType: "simulation",
        inputText: body.inputText,
        isFollowingOverride: body.isFollowing,
        action: body.action,
        ...(body.sessionId ? { sessionId: body.sessionId } : {}),
        ...(process.env.SETTINGS_ENCRYPTION_KEY ? { encryptionKeyRaw: process.env.SETTINGS_ENCRYPTION_KEY } : {}),
      });
      return result;
    }

    if (body.intent === "sync_comments") {
      const res = await syncAndReplyRecentInstagramComments(db, {
        organizationId: orgId,
        ...(body.instagramAccountId ? { instagramAccountId: body.instagramAccountId } : {}),
        ...(process.env.SETTINGS_ENCRYPTION_KEY ? { encryptionKeyRaw: process.env.SETTINGS_ENCRYPTION_KEY } : {}),
      });
      return res;
    }

    return { ok: true };
  });
}
