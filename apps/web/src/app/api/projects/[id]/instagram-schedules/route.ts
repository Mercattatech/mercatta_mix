import { z } from "zod";
import { createBulkInstagramSchedules, listSocialSchedules, QUEUES, updateSocialSchedule } from "@mercatta/server";
import { handle } from "@/lib/api";
import { projectAccess, requireApiUser } from "@/lib/auth";
import { getDb, getQueue } from "@/lib/db";

const createBody = z.object({
  instagramAccountId: z.uuid(),
  format: z.enum(["REELS", "POST", "CAROUSEL"]).default("REELS"),
  carouselSize: z.number().int().min(2).max(10).optional(),
  renderIds: z.array(z.uuid()).max(2000).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  scheduleMode: z.enum(["fixed_times", "interval"]).default("fixed_times"),
  timesOfDay: z.array(z.string()).optional(),
  intervalMinutes: z.number().int().min(15).max(1440).optional(),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  timezoneOffsetMinutes: z.number().int().optional(),
  captionTemplate: z.string().max(2200).default(""),
  shareToFeed: z.boolean().optional(),
});

const patchBody = z.object({
  scheduleId: z.uuid(),
  scheduledAt: z.string().optional(),
  format: z.enum(["REELS", "POST", "CAROUSEL"]).optional(),
  caption: z.string().max(2200).optional(),
  action: z.enum(["cancel", "publish_now"]).optional(),
});

export function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const { organizationId } = await projectAccess(user.id, projectId, "read");
    const schedules = await listSocialSchedules(getDb(), organizationId, projectId);
    return { schedules };
  });
}

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const input = createBody.parse(await req.json());
    const { organizationId } = await projectAccess(user.id, projectId, "write");

    const res = await createBulkInstagramSchedules(getDb(), {
      organizationId,
      projectId,
      instagramAccountId: input.instagramAccountId,
      format: input.format,
      ...(input.carouselSize !== undefined ? { carouselSize: input.carouselSize } : {}),
      ...(input.renderIds ? { renderIds: input.renderIds } : {}),
      startDate: input.startDate,
      daysOfWeek: input.daysOfWeek,
      scheduleMode: input.scheduleMode,
      ...(input.timesOfDay ? { timesOfDay: input.timesOfDay } : {}),
      ...(input.intervalMinutes !== undefined ? { intervalMinutes: input.intervalMinutes } : {}),
      ...(input.windowStart ? { windowStart: input.windowStart } : {}),
      ...(input.windowEnd ? { windowEnd: input.windowEnd } : {}),
      ...(input.timezoneOffsetMinutes !== undefined ? { timezoneOffsetMinutes: input.timezoneOffsetMinutes } : {}),
      captionTemplate: input.captionTemplate,
      ...(input.shareToFeed !== undefined ? { shareToFeed: input.shareToFeed } : {}),
    });

    const queue = await getQueue();
    for (const item of res.toPublish) {
      await queue.publish(
        QUEUES.publish,
        { organizationId, jobId: item.jobId, scheduleId: item.scheduleId },
        { startAfter: item.scheduledAt },
      );
    }

    return { schedules: res.schedules, count: res.schedules.length };
  });
}

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireApiUser();
    const { id: projectId } = await ctx.params;
    const input = patchBody.parse(await req.json());
    const { organizationId } = await projectAccess(user.id, projectId, "write");

    const res = await updateSocialSchedule(getDb(), {
      organizationId,
      scheduleId: input.scheduleId,
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.format ? { format: input.format } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.action ? { action: input.action } : {}),
    });

    if (res.jobId && res.scheduledAt) {
      const queue = await getQueue();
      await queue.publish(
        QUEUES.publish,
        { organizationId, jobId: res.jobId, scheduleId: input.scheduleId },
        { startAfter: res.scheduledAt, priority: input.action === "publish_now" ? 10 : 0 },
      );
    }

    return { ok: true };
  });
}
