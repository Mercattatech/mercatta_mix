import { createHmac } from "node:crypto";
import { jobIdempotencyKey } from "@mercatta/core";
import { UserFacingError } from "./errors";
import { resetJob, upsertJob } from "./jobs";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "./mail-settings";
import type { Db, Sql } from "./sql";

export type InstagramFormat = "REELS" | "POST" | "CAROUSEL";
export type ScheduleStatus = "scheduled" | "publishing" | "published" | "failed" | "canceled";

export interface InstagramAccountView {
  id: string;
  organizationId: string;
  name: string;
  username: string | null;
  igUserId: string;
  status: "active" | "disconnected" | "error";
  lastVerifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface UpsertInstagramAccountInput {
  organizationId: string;
  name: string;
  igUserId: string;
  accessToken: string;
  username?: string | null;
  verifyWithMeta?: boolean;
}

export interface BulkScheduleInput {
  organizationId: string;
  projectId: string;
  instagramAccountId: string;
  format: InstagramFormat;
  /** Quantos vídeos por carrossel (2 a 10) quando format === 'CAROUSEL'. */
  carouselSize?: number;
  /** IDs específicos de renders prontos (opcional; padrão = todos os renders prontos do projeto). */
  renderIds?: string[];
  /** Data inicial no formato YYYY-MM-DD. */
  startDate: string;
  /** Dias da semana permitidos: 0 (Dom) a 6 (Sáb). */
  daysOfWeek: number[];
  /** Modo de distribuição no dia: horários fixos ou intervalo em minutos. */
  scheduleMode: "fixed_times" | "interval";
  /** Horários no formato HH:MM (ex.: ["09:00", "13:00", "19:00"]). */
  timesOfDay?: string[];
  /** Intervalo em minutos quando scheduleMode === 'interval' (ex.: 180 = a cada 3h). */
  intervalMinutes?: number;
  /** Janela diária para o modo intervalo (ex.: "08:00" até "22:00"). */
  windowStart?: string;
  windowEnd?: string;
  /** Fuso horário em minutos (padrão -180 = Brasília UTC-3). */
  timezoneOffsetMinutes?: number;
  /** Modelo de legenda da publicação (suporta {projeto}, {codigo}, {indice}, {total}). */
  captionTemplate: string;
  shareToFeed?: boolean;
}

export interface SocialScheduleView {
  id: string;
  organizationId: string;
  projectId: string;
  projectName?: string;
  instagramAccountId: string;
  accountName: string;
  accountUsername: string | null;
  format: InstagramFormat;
  renderIds: string[];
  codes: string[];
  caption: string;
  shareToFeed: boolean;
  scheduledAt: string;
  status: ScheduleStatus;
  igContainerId: string | null;
  igMediaId: string | null;
  permalink: string | null;
  errorPt: string | null;
  publishedAt: string | null;
}

function encodeToken(plain: string, rawKey?: string): string {
  const token = plain.trim();
  if (!token) throw new UserFacingError("Informe o Access Token da conta do Instagram.");
  try {
    if (rawKey?.trim()) {
      return encryptSecret(token, parseEncryptionKey(rawKey));
    }
  } catch {
    // fallback seguro caso SETTINGS_ENCRYPTION_KEY não esteja definida em desenvolvimento
  }
  return `plain:${Buffer.from(token, "utf8").toString("base64url")}`;
}

export function decodeInstagramToken(stored: string, rawKey?: string): string {
  if (stored.startsWith("plain:")) {
    return Buffer.from(stored.slice("plain:".length), "base64url").toString("utf8");
  }
  return decryptSecret(stored, parseEncryptionKey(rawKey));
}

/** Assina uma URL pública temporária para que os servidores da Meta possam baixar o arquivo MP4 ao publicar. */
export function signPublicRenderToken(renderId: string, secret: string): string {
  return createHmac("sha256", secret || "mercatta-mix-ig-media")
    .update(`ig-render:${renderId}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyPublicRenderToken(renderId: string, token: string, secret: string): boolean {
  const expected = signPublicRenderToken(renderId, secret);
  return token === expected;
}

export async function listInstagramAccounts(sql: Sql, organizationId: string): Promise<InstagramAccountView[]> {
  const r = await sql.query<{
    id: string;
    organization_id: string;
    name: string;
    username: string | null;
    ig_user_id: string;
    status: "active" | "disconnected" | "error";
    last_verified_at: Date | null;
    last_error: string | null;
    created_at: Date;
  }>(
    `select id, organization_id, name, username, ig_user_id, status, last_verified_at, last_error, created_at
       from instagram_accounts
      where organization_id = $1
      order by created_at asc`,
    [organizationId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    username: row.username,
    igUserId: row.ig_user_id,
    status: row.status,
    lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at).toISOString() : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function verifyInstagramGraphCredentials(
  igUserId: string,
  accessToken: string,
): Promise<{ ok: boolean; username?: string; name?: string; error?: string }> {
  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId.trim())}?fields=id,username,name&access_token=${encodeURIComponent(accessToken.trim())}`;
    const res = await fetch(url, { method: "GET" });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      username?: string;
      name?: string;
      error?: { message?: string };
    };
    if (!res.ok || data.error) {
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status} ao validar token na Meta Graph API.` };
    }
    return {
      ok: true,
      ...(data.username ? { username: data.username } : {}),
      ...(data.name ? { name: data.name } : {}),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Falha de conexão com graph.facebook.com." };
  }
}

export async function upsertInstagramAccount(
  sql: Sql,
  input: UpsertInstagramAccountInput,
  encryptionKeyRaw?: string,
): Promise<InstagramAccountView> {
  const name = input.name.trim();
  const igUserId = input.igUserId.trim();
  if (!name) throw new UserFacingError("Informe um nome para identificar a conta (ex.: @suaempresa).");
  if (!igUserId) throw new UserFacingError("Informe o Instagram Business Account ID (IG User ID).");

  const encToken = encodeToken(input.accessToken, encryptionKeyRaw);
  let username = input.username?.trim().replace(/^@/, "") || null;
  let status: "active" | "error" = "active";
  let lastError: string | null = null;
  let lastVerifiedAt: Date | null = null;

  if (input.verifyWithMeta !== false) {
    const check = await verifyInstagramGraphCredentials(igUserId, input.accessToken);
    lastVerifiedAt = new Date();
    if (check.ok) {
      if (check.username) username = check.username;
    } else {
      // Salva a conta mesmo se o token for de teste/ainda não publicado, mas registra o aviso
      lastError = check.error ?? null;
    }
  }

  const r = await sql.query<{
    id: string;
    organization_id: string;
    name: string;
    username: string | null;
    ig_user_id: string;
    status: "active" | "disconnected" | "error";
    last_verified_at: Date | null;
    last_error: string | null;
    created_at: Date;
  }>(
    `insert into instagram_accounts (organization_id, name, username, ig_user_id, access_token_enc, status, last_verified_at, last_error)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (organization_id, ig_user_id)
     do update set
       name = excluded.name,
       username = coalesce(excluded.username, instagram_accounts.username),
       access_token_enc = excluded.access_token_enc,
       status = excluded.status,
       last_verified_at = excluded.last_verified_at,
       last_error = excluded.last_error,
       updated_at = now()
     returning id, organization_id, name, username, ig_user_id, status, last_verified_at, last_error, created_at`,
    [input.organizationId, name, username, igUserId, encToken, status, lastVerifiedAt, lastError],
  );
  const row = r.rows[0]!;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    username: row.username,
    igUserId: row.ig_user_id,
    status: row.status,
    lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at).toISOString() : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function deleteInstagramAccount(sql: Sql, organizationId: string, accountId: string): Promise<void> {
  await sql.query("delete from instagram_accounts where organization_id = $1 and id = $2", [organizationId, accountId]);
}

function parseTimeHHMM(hhmm: string): { hours: number; minutes: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new UserFacingError(`Horário inválido: "${hhmm}". Use o formato HH:MM (ex.: 09:00).`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new UserFacingError(`Horário fora da faixa (00:00 a 23:59): "${hhmm}".`);
  }
  return { hours, minutes };
}

/**
 * Calcula a lista de horários diários (em minutos desde 00:00) conforme o modo escolhido.
 */
export function resolveDailySlotsMinutes(input: {
  scheduleMode: "fixed_times" | "interval";
  timesOfDay?: string[];
  intervalMinutes?: number;
  windowStart?: string;
  windowEnd?: string;
}): number[] {
  if (input.scheduleMode === "fixed_times") {
    const raw = (input.timesOfDay ?? ["09:00", "13:00", "19:00"]).filter((t) => t.trim().length > 0);
    if (raw.length === 0) throw new UserFacingError("Informe ao menos um horário no dia (ex.: 09:00).");
    const mins = raw.map((t) => {
      const { hours, minutes } = parseTimeHHMM(t);
      return hours * 60 + minutes;
    });
    return Array.from(new Set(mins)).sort((a, b) => a - b);
  }

  const interval = Math.max(15, Math.min(24 * 60, Number(input.intervalMinutes ?? 180)));
  const start = parseTimeHHMM(input.windowStart ?? "09:00");
  const end = parseTimeHHMM(input.windowEnd ?? "21:00");
  const startMin = start.hours * 60 + start.minutes;
  const endMin = end.hours * 60 + end.minutes;
  if (endMin < startMin) throw new UserFacingError("O horário final da janela deve ser maior ou igual ao horário inicial.");

  const slots: number[] = [];
  for (let m = startMin; m <= endMin; m += interval) {
    slots.push(m);
  }
  return slots.length > 0 ? slots : [startMin];
}

/**
 * Gera os carimbos de data/hora (`Date`) para `count` publicações, distribuindo nos dias da semana e horários escolhidos.
 */
export function computeBulkScheduleDates(input: {
  count: number;
  startDate: string;
  daysOfWeek: number[];
  dailySlotsMinutes: number[];
  timezoneOffsetMinutes?: number;
  now?: Date;
}): Date[] {
  const { count, startDate, daysOfWeek, dailySlotsMinutes } = input;
  if (count <= 0) return [];
  const allowedDays = new Set(daysOfWeek.length > 0 ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6]);
  const tzOffset = input.timezoneOffsetMinutes ?? -180; // UTC-3 (Brasília)
  const now = input.now ?? new Date();

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate.trim());
  if (!m) throw new UserFacingError("Data inicial inválida. Use o formato AAAA-MM-DD.");
  const startYear = Number(m[1]);
  const startMonth = Number(m[2]) - 1;
  const startDay = Number(m[3]);

  const result: Date[] = [];
  let dayOffset = 0;

  while (result.length < count && dayOffset < 3660) {
    const dayUtcMidnight = Date.UTC(startYear, startMonth, startDay + dayOffset, 0, 0, 0);
    const dayOfWeek = new Date(dayUtcMidnight).getUTCDay();
    if (allowedDays.has(dayOfWeek)) {
      for (const slotMin of dailySlotsMinutes) {
        // Converte horário local (com tzOffset) para UTC: UTC = local - tzOffset
        const utcMs = dayUtcMidnight + (slotMin - tzOffset) * 60_000;
        const candidate = new Date(utcMs);
        if (candidate.getTime() > now.getTime() - 60_000) {
          result.push(candidate);
          if (result.length >= count) break;
        }
      }
    }
    dayOffset++;
  }

  return result;
}

export async function createBulkInstagramSchedules(
  db: Db,
  input: BulkScheduleInput,
): Promise<{
  schedules: SocialScheduleView[];
  toPublish: { jobId: string; scheduleId: string; scheduledAt: Date }[];
}> {
  return db.transaction(async (tx) => {
    const projRes = await tx.query<{ id: string; name: string }>(
      "select id, name from projects where organization_id = $1 and id = $2",
      [input.organizationId, input.projectId],
    );
    const project = projRes.rows[0];
    if (!project) throw new UserFacingError("Projeto não encontrado.");

    const accRes = await tx.query<{ id: string; name: string; username: string | null }>(
      "select id, name, username from instagram_accounts where organization_id = $1 and id = $2",
      [input.organizationId, input.instagramAccountId],
    );
    const account = accRes.rows[0];
    if (!account) throw new UserFacingError("Selecione ou conecte uma conta do Instagram antes de programar.");

    // Busca os renders concluídos mais recentes por combinação do projeto
    const rendersRes = await tx.query<{ id: string; code: string }>(
      `select distinct on (r.combination_id) r.id, c.code
         from renders r
         join combinations c on c.id = r.combination_id
        where r.organization_id = $1
          and r.project_id = $2
          and r.status = 'succeeded'
          and ($3::uuid[] is null or r.id = any($3::uuid[]))
        order by r.combination_id, (r.plan_hash = c.plan_hash) desc, r.created_at desc`,
      [input.organizationId, input.projectId, input.renderIds && input.renderIds.length > 0 ? input.renderIds : null],
    );

    const readyRenders = rendersRes.rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    if (readyRenders.length === 0) {
      throw new UserFacingError("Nenhum vídeo pronto encontrado neste projeto para agendar.");
    }

    // Agrupa os vídeos: 1 por publicação (REELS / POST) ou N por publicação (CAROUSEL)
    const groups: { renderIds: string[]; codes: string[] }[] = [];
    if (input.format === "CAROUSEL") {
      const size = Math.max(2, Math.min(10, Number(input.carouselSize ?? 3)));
      for (let i = 0; i < readyRenders.length; i += size) {
        const slice = readyRenders.slice(i, i + size);
        if (slice.length === 1 && groups.length > 0) {
          // Se sobrar apenas 1 vídeo no último lote e o carrossel do Instagram exige no mínimo 2 itens, junta no anterior (se < 10) ou duplica com o primeiro
          const prev = groups[groups.length - 1]!;
          if (prev.renderIds.length < 10) {
            prev.renderIds.push(slice[0]!.id);
            prev.codes.push(slice[0]!.code);
            continue;
          }
        }
        groups.push({
          renderIds: slice.map((s) => s.id),
          codes: slice.map((s) => s.code),
        });
      }
    } else {
      for (const r of readyRenders) {
        groups.push({ renderIds: [r.id], codes: [r.code] });
      }
    }

    const dailySlots = resolveDailySlotsMinutes({
      scheduleMode: input.scheduleMode,
      ...(input.timesOfDay ? { timesOfDay: input.timesOfDay } : {}),
      ...(input.intervalMinutes !== undefined ? { intervalMinutes: input.intervalMinutes } : {}),
      ...(input.windowStart ? { windowStart: input.windowStart } : {}),
      ...(input.windowEnd ? { windowEnd: input.windowEnd } : {}),
    });

    const dates = computeBulkScheduleDates({
      count: groups.length,
      startDate: input.startDate,
      daysOfWeek: input.daysOfWeek,
      dailySlotsMinutes: dailySlots,
      ...(input.timezoneOffsetMinutes !== undefined ? { timezoneOffsetMinutes: input.timezoneOffsetMinutes } : {}),
    });

    const schedules: SocialScheduleView[] = [];
    const toPublish: { jobId: string; scheduleId: string; scheduledAt: Date }[] = [];
    const shareToFeed = input.shareToFeed ?? true;

    for (let i = 0; i < groups.length; i++) {
      const grp = groups[i]!;
      const scheduledAt = dates[i]!;
      const codesLabel = grp.codes.join(", ");
      const caption = (input.captionTemplate || "")
        .replace(/\{projeto\}/gi, project.name)
        .replace(/\{codigo\}/gi, codesLabel)
        .replace(/\{indice\}/gi, String(i + 1))
        .replace(/\{total\}/gi, String(groups.length))
        .trim();

      const inserted = await tx.query<{
        id: string;
        scheduled_at: Date;
        status: ScheduleStatus;
      }>(
        `insert into social_schedules
          (organization_id, project_id, instagram_account_id, format, render_ids, codes, caption, share_to_feed, scheduled_at, status)
         values ($1, $2, $3, $4, $5::uuid[], $6::text[], $7, $8, $9, 'scheduled')
         returning id, scheduled_at, status`,
        [
          input.organizationId,
          input.projectId,
          input.instagramAccountId,
          input.format,
          grp.renderIds,
          grp.codes,
          caption,
          shareToFeed,
          scheduledAt.toISOString(),
        ],
      );
      const sched = inserted.rows[0]!;

      const job = await upsertJob(tx, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        kind: "publish",
        idempotencyKey: jobIdempotencyKey("publish", { scheduleId: sched.id, scheduledAt: scheduledAt.toISOString() }),
        payload: { scheduleId: sched.id },
        priority: 0,
        refType: "social_schedule",
        refId: sched.id,
      });

      toPublish.push({ jobId: job.id, scheduleId: sched.id, scheduledAt });
      schedules.push({
        id: sched.id,
        organizationId: input.organizationId,
        projectId: input.projectId,
        projectName: project.name,
        instagramAccountId: input.instagramAccountId,
        accountName: account.name,
        accountUsername: account.username,
        format: input.format,
        renderIds: grp.renderIds,
        codes: grp.codes,
        caption,
        shareToFeed,
        scheduledAt: new Date(sched.scheduled_at).toISOString(),
        status: sched.status,
        igContainerId: null,
        igMediaId: null,
        permalink: null,
        errorPt: null,
        publishedAt: null,
      });
    }

    return { schedules, toPublish };
  });
}

export async function listSocialSchedules(
  sql: Sql,
  organizationId: string,
  projectId?: string,
): Promise<SocialScheduleView[]> {
  const r = await sql.query<{
    id: string;
    organization_id: string;
    project_id: string;
    project_name: string;
    instagram_account_id: string;
    account_name: string;
    account_username: string | null;
    format: InstagramFormat;
    render_ids: string[];
    codes: string[];
    caption: string;
    share_to_feed: boolean;
    scheduled_at: Date;
    status: ScheduleStatus;
    ig_container_id: string | null;
    ig_media_id: string | null;
    permalink: string | null;
    error_pt: string | null;
    published_at: Date | null;
  }>(
    `select s.id, s.organization_id, s.project_id, p.name as project_name,
            s.instagram_account_id, a.name as account_name, a.username as account_username,
            s.format, s.render_ids, s.codes, s.caption, s.share_to_feed,
            s.scheduled_at, s.status, s.ig_container_id, s.ig_media_id,
            s.permalink, s.error_pt, s.published_at
       from social_schedules s
       join projects p on p.id = s.project_id
       join instagram_accounts a on a.id = s.instagram_account_id
      where s.organization_id = $1
        and ($2::uuid is null or s.project_id = $2::uuid)
      order by s.scheduled_at asc, s.created_at asc`,
    [organizationId, projectId ?? null],
  );

  return r.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    projectName: row.project_name,
    instagramAccountId: row.instagram_account_id,
    accountName: row.account_name,
    accountUsername: row.account_username,
    format: row.format,
    renderIds: row.render_ids,
    codes: row.codes,
    caption: row.caption,
    shareToFeed: row.share_to_feed,
    scheduledAt: new Date(row.scheduled_at).toISOString(),
    status: row.status,
    igContainerId: row.ig_container_id,
    igMediaId: row.ig_media_id,
    permalink: row.permalink,
    errorPt: row.error_pt,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
  }));
}

export async function updateSocialSchedule(
  db: Db,
  input: {
    organizationId: string;
    scheduleId: string;
    scheduledAt?: string;
    format?: InstagramFormat;
    caption?: string;
    action?: "cancel" | "publish_now";
  },
): Promise<{ jobId?: string; scheduledAt?: Date }> {
  return db.transaction(async (tx) => {
    const existing = (
      await tx.query<{ id: string; project_id: string; scheduled_at: Date; status: ScheduleStatus }>(
        "select id, project_id, scheduled_at, status from social_schedules where organization_id = $1 and id = $2",
        [input.organizationId, input.scheduleId],
      )
    ).rows[0];
    if (!existing) throw new UserFacingError("Agendamento não encontrado.");

    if (input.action === "cancel") {
      await tx.query(
        "update social_schedules set status = 'canceled', updated_at = now() where organization_id = $1 and id = $2",
        [input.organizationId, input.scheduleId],
      );
      return {};
    }

    const nextScheduledAt =
      input.action === "publish_now"
        ? new Date()
        : input.scheduledAt
          ? new Date(input.scheduledAt)
          : new Date(existing.scheduled_at);

    await tx.query(
      `update social_schedules
          set scheduled_at = $3,
              format = coalesce($4, format),
              caption = coalesce($5, caption),
              status = 'scheduled',
              error_pt = null,
              updated_at = now()
        where organization_id = $1 and id = $2`,
      [
        input.organizationId,
        input.scheduleId,
        nextScheduledAt.toISOString(),
        input.format ?? null,
        input.caption ?? null,
      ],
    );

    const job = await upsertJob(tx, {
      organizationId: input.organizationId,
      projectId: existing.project_id,
      kind: "publish",
      idempotencyKey: jobIdempotencyKey("publish", { scheduleId: existing.id, scheduledAt: nextScheduledAt.toISOString() }),
      payload: { scheduleId: existing.id },
      priority: input.action === "publish_now" ? 10 : 0,
      refType: "social_schedule",
      refId: existing.id,
    });
    await resetJob(tx, input.organizationId, job.id);
    return { jobId: job.id, scheduledAt: nextScheduledAt };
  });
}

async function waitForIgContainerReady(igContainerId: string, accessToken: string, maxPolls = 30): Promise<void> {
  for (let i = 0; i < maxPolls; i++) {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(igContainerId)}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as {
      status_code?: string;
      status?: string;
      error?: { message?: string };
    };
    if (!res.ok || data.error) {
      throw new UserFacingError(data.error?.message ?? `Erro HTTP ${res.status} ao consultar processamento do vídeo no Instagram.`);
    }
    if (data.status_code === "FINISHED" || data.status_code === "PUBLISHED") {
      return;
    }
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new UserFacingError(`O Instagram rejeitou o processamento do vídeo (${data.status || data.status_code}). Verifique se a URL pública está acessível.`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new UserFacingError("Tempo limite excedido aguardando o processamento do container de mídia no Instagram.");
}

async function createIgMediaContainer(
  igUserId: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<string> {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new UserFacingError(data.error?.message ?? `Falha ao criar container no Instagram Graph API (HTTP ${res.status}).`);
  }
  return data.id;
}

async function publishIgMediaContainer(igUserId: string, accessToken: string, creationId: string): Promise<string> {
  const body = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new UserFacingError(data.error?.message ?? `Falha ao publicar mídia no Instagram Graph API (HTTP ${res.status}).`);
  }
  return data.id;
}

/**
 * Executa a publicação de um agendamento na API Oficial do Instagram Graph (Reels, Post ou Carrossel).
 */
export async function executeInstagramPublish(
  sql: Sql,
  opts: {
    organizationId: string;
    scheduleId: string;
    appUrl: string;
    encryptionKeyRaw?: string;
    resolveVideoUrl?: (renderId: string, r2Key: string) => Promise<string>;
  },
): Promise<{ igMediaId: string; permalink: string | null }> {
  const row = (
    await sql.query<{
      id: string;
      format: InstagramFormat;
      render_ids: string[];
      caption: string;
      share_to_feed: boolean;
      status: ScheduleStatus;
      ig_user_id: string;
      access_token_enc: string;
    }>(
      `select s.id, s.format, s.render_ids, s.caption, s.share_to_feed, s.status,
              a.ig_user_id, a.access_token_enc
         from social_schedules s
         join instagram_accounts a on a.id = s.instagram_account_id
        where s.organization_id = $1 and s.id = $2`,
      [opts.organizationId, opts.scheduleId],
    )
  ).rows[0];

  if (!row) throw new UserFacingError("Agendamento não encontrado.");
  if (row.status === "canceled") throw new UserFacingError("Este agendamento foi cancelado.");

  await sql.query(
    "update social_schedules set status = 'publishing', error_pt = null, updated_at = now() where organization_id = $1 and id = $2",
    [opts.organizationId, opts.scheduleId],
  );

  const accessToken = decodeInstagramToken(row.access_token_enc, opts.encryptionKeyRaw);
  const igUserId = row.ig_user_id;

  const assets = await sql.query<{ render_id: string; r2_key: string }>(
    `select r.id as render_id, m.r2_key
       from renders r
       join media_assets m on m.id = r.asset_id
      where r.organization_id = $1 and r.id = any($2::uuid[])`,
    [opts.organizationId, row.render_ids],
  );
  const keyByRender = new Map(assets.rows.map((a) => [a.render_id, a.r2_key]));

  const videoUrls: string[] = [];
  const baseAppUrl = opts.appUrl.replace(/\/$/, "");
  for (const renderId of row.render_ids) {
    const r2Key = keyByRender.get(renderId);
    if (!r2Key) throw new UserFacingError(`Arquivo de vídeo do render ${renderId} não encontrado.`);
    if (opts.resolveVideoUrl) {
      videoUrls.push(await opts.resolveVideoUrl(renderId, r2Key));
    } else {
      const sig = signPublicRenderToken(renderId, opts.encryptionKeyRaw ?? "");
      videoUrls.push(`${baseAppUrl}/api/renders/${renderId}/public-video?token=${sig}`);
    }
  }

  let parentContainerId: string;

  if (row.format === "CAROUSEL" && videoUrls.length >= 2) {
    const childIds: string[] = [];
    for (const vUrl of videoUrls.slice(0, 10)) {
      const childId = await createIgMediaContainer(igUserId, accessToken, {
        media_type: "VIDEO",
        video_url: vUrl,
        is_carousel_item: "true",
      });
      childIds.push(childId);
    }
    for (const childId of childIds) {
      await waitForIgContainerReady(childId, accessToken);
    }
    parentContainerId = await createIgMediaContainer(igUserId, accessToken, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: row.caption,
    });
  } else if (row.format === "POST") {
    parentContainerId = await createIgMediaContainer(igUserId, accessToken, {
      media_type: "VIDEO",
      video_url: videoUrls[0]!,
      caption: row.caption,
    });
  } else {
    parentContainerId = await createIgMediaContainer(igUserId, accessToken, {
      media_type: "REELS",
      video_url: videoUrls[0]!,
      caption: row.caption,
      share_to_feed: row.share_to_feed ? "true" : "false",
    });
  }

  await sql.query(
    "update social_schedules set ig_container_id = $3, updated_at = now() where organization_id = $1 and id = $2",
    [opts.organizationId, opts.scheduleId, parentContainerId],
  );

  await waitForIgContainerReady(parentContainerId, accessToken);
  const igMediaId = await publishIgMediaContainer(igUserId, accessToken, parentContainerId);

  let permalink: string | null = null;
  try {
    const pRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(igMediaId)}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
    );
    const pData = (await pRes.json().catch(() => ({}))) as { permalink?: string };
    if (pData.permalink) permalink = pData.permalink;
  } catch {
    // permalink é opcional
  }

  await sql.query(
    `update social_schedules
        set status = 'published',
            ig_media_id = $3,
            permalink = $4,
            published_at = now(),
            error_pt = null,
            updated_at = now()
      where organization_id = $1 and id = $2`,
    [opts.organizationId, opts.scheduleId, igMediaId, permalink],
  );

  return { igMediaId, permalink };
}
