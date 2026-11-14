import { UserFacingError } from "./errors";
import { decodeInstagramToken } from "./instagram";
import type { Sql } from "./sql";

export type TriggerType = "comment" | "dm" | "story_reply" | "any";
export type MediaScope = "all_media" | "specific_media" | "project_media";
export type MatchMode = "contains" | "exact" | "any_comment";
export type CollectLeadField = "none" | "email" | "whatsapp";
export type SessionStage = "triggered" | "awaiting_follow" | "awaiting_lead_input" | "delivered" | "failed";

export interface InstagramAutomationView {
  id: string;
  organizationId: string;
  instagramAccountId: string;
  accountName: string;
  accountUsername: string | null;
  projectId: string | null;
  name: string;
  status: "active" | "paused";
  triggerType: TriggerType;
  mediaScope: MediaScope;
  targetMediaIds: string[];
  matchMode: MatchMode;
  keywords: string[];
  replyToComment: boolean;
  commentReplies: string[];
  requireFollow: boolean;
  followGateMessage: string;
  followGateButtonLabel: string;
  notFollowingMessage: string;
  collectLeadField: CollectLeadField;
  collectLeadPrompt: string;
  dmMessage: string;
  dmButtonTitle: string;
  dmButtonUrl: string;
  triggersCount: number;
  commentRepliesCount: number;
  dmsSentCount: number;
  followersGainedCount: number;
  leadsCapturedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramAutomationSessionView {
  id: string;
  organizationId: string;
  automationId: string;
  automationName: string;
  instagramAccountId: string;
  accountUsername: string | null;
  igSenderId: string;
  igUsername: string | null;
  igName: string | null;
  sourceType: "comment" | "dm" | "story_reply" | "simulation";
  externalEventId: string | null;
  triggerText: string | null;
  isFollowing: boolean;
  stage: SessionStage;
  leadEmail: string | null;
  leadWhatsapp: string | null;
  commentReplySent: string | null;
  dmSent: string | null;
  errorPt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertInstagramAutomationInput {
  id?: string;
  organizationId: string;
  instagramAccountId: string;
  projectId?: string | null;
  name: string;
  status?: "active" | "paused";
  triggerType: TriggerType;
  mediaScope?: MediaScope;
  targetMediaIds?: string[];
  matchMode: MatchMode;
  keywords: string[];
  replyToComment: boolean;
  commentReplies: string[];
  requireFollow: boolean;
  followGateMessage: string;
  followGateButtonLabel?: string;
  notFollowingMessage: string;
  collectLeadField?: CollectLeadField;
  collectLeadPrompt?: string;
  dmMessage: string;
  dmButtonTitle?: string;
  dmButtonUrl?: string;
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function matchesAutomationKeywords(
  text: string,
  matchMode: MatchMode,
  keywords: string[],
): boolean {
  if (matchMode === "any_comment") return true;
  const cleanText = normalizeText(text);
  if (!cleanText) return false;
  const validKeywords = keywords.map(normalizeText).filter(Boolean);
  if (validKeywords.length === 0) return true;
  if (matchMode === "exact") {
    return validKeywords.some((kw) => cleanText === kw);
  }
  return validKeywords.some((kw) => cleanText.includes(kw));
}

function interpolateTemplate(
  tpl: string,
  vars: { username?: string | null; name?: string | null; conta?: string | null },
): string {
  const userLabel = vars.username ? `@${vars.username.replace(/^@/, "")}` : vars.name || "você";
  const accLabel = vars.conta ? `@${vars.conta.replace(/^@/, "")}` : "nosso perfil";
  return tpl
    .replace(/\{username\}/gi, userLabel)
    .replace(/\{nome\}/gi, vars.name || userLabel)
    .replace(/\{conta\}/gi, accLabel)
    .trim();
}

function mapAutomationRow(row: Record<string, unknown>): InstagramAutomationView {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    instagramAccountId: String(row.instagram_account_id),
    accountName: String(row.account_name ?? ""),
    accountUsername: row.account_username ? String(row.account_username) : null,
    projectId: row.project_id ? String(row.project_id) : null,
    name: String(row.name),
    status: (row.status as "active" | "paused") || "active",
    triggerType: (row.trigger_type as TriggerType) || "comment",
    mediaScope: (row.media_scope as MediaScope) || "all_media",
    targetMediaIds: Array.isArray(row.target_media_ids) ? (row.target_media_ids as string[]) : [],
    matchMode: (row.match_mode as MatchMode) || "contains",
    keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
    replyToComment: Boolean(row.reply_to_comment),
    commentReplies: Array.isArray(row.comment_replies) ? (row.comment_replies as string[]) : [],
    requireFollow: Boolean(row.require_follow),
    followGateMessage: String(row.follow_gate_message ?? ""),
    followGateButtonLabel: String(row.follow_gate_button_label ?? "✅ Já sigo! Liberar acesso"),
    notFollowingMessage: String(row.not_following_message ?? ""),
    collectLeadField: (row.collect_lead_field as CollectLeadField) || "none",
    collectLeadPrompt: String(row.collect_lead_prompt ?? ""),
    dmMessage: String(row.dm_message ?? ""),
    dmButtonTitle: String(row.dm_button_title ?? "Acessar Agora 🚀"),
    dmButtonUrl: String(row.dm_button_url ?? ""),
    triggersCount: Number(row.triggers_count ?? 0),
    commentRepliesCount: Number(row.comment_replies_count ?? 0),
    dmsSentCount: Number(row.dms_sent_count ?? 0),
    followersGainedCount: Number(row.followers_gained_count ?? 0),
    leadsCapturedCount: Number(row.leads_captured_count ?? 0),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function seedDefaultAutomationsIfEmpty(sql: Sql, organizationId: string): Promise<void> {
  const existing = await sql.query<{ c: number }>(
    "select count(*)::int as c from instagram_automations where organization_id = $1",
    [organizationId],
  );
  if ((existing.rows[0]?.c ?? 0) > 0) return;

  const accRes = await sql.query<{ id: string; username: string | null }>(
    `select id, username from instagram_accounts
      where organization_id = $1
      order by (case when username = 'grupomercatta' then 0 else 1 end) asc, created_at asc
      limit 1`,
    [organizationId],
  );
  const acc = accRes.rows[0];
  if (!acc) return;

  // Template 1: Comentário -> Responder Comentário + Trava de Seguidor ("Só entrega se seguir") + Link no Direct
  await upsertInstagramAutomation(sql, {
    organizationId,
    instagramAccountId: acc.id,
    name: "🔥 Isca Digital nos Reels (Comente QUERO + Trava de Seguidor)",
    status: "active",
    triggerType: "comment",
    mediaScope: "all_media",
    matchMode: "contains",
    keywords: ["QUERO", "EU QUERO", "LINK", "ACESSO", "MATERIAL", "COMO"],
    replyToComment: true,
    commentReplies: [
      "Acabei de te enviar no Direct! Dá uma olhada nas suas mensagens 🔥",
      "Te chamei na DM com o acesso! Confere lá 📩",
      "Enviado no seu Direct agora mesmo! 🚀",
    ],
    requireFollow: true,
    followGateMessage:
      "Opa, {nome}! Vi seu comentário 👋\n\nPara liberar o seu acesso exclusivo gratuitamente, eu só preciso confirmar que você já segue o nosso perfil {conta}.\n\n👉 Siga {conta} e toque no botão abaixo para receber na hora:",
    followGateButtonLabel: "✅ Já sigo! Liberar meu acesso",
    notFollowingMessage:
      "Hmm, acabei de verificar aqui e parece que você ainda não está seguindo {conta} 👀\n\n1️⃣ Entre no perfil {conta} e clique em **Seguir**\n2️⃣ Volte aqui e clique em **✅ Já sigo! Liberar meu acesso** que o sistema libera na mesma hora!",
    collectLeadField: "none",
    collectLeadPrompt: "",
    dmMessage:
      "Confirmado que você é nosso seguidor! 🎉\n\nAqui está o acesso prometido. Toque no botão abaixo para abrir agora:",
    dmButtonTitle: "Abrir Acesso Exclusivo 🚀",
    dmButtonUrl: "https://grupomercatta.com.br",
  });

  // Template 2: Comentário / Direct -> Captura de WhatsApp + Trava de Seguidor
  await upsertInstagramAutomation(sql, {
    organizationId,
    instagramAccountId: acc.id,
    name: "📲 Captura de Lead WhatsApp + Trava de Seguidor (ORÇAMENTO / CONSULTORIA)",
    status: "active",
    triggerType: "any",
    mediaScope: "all_media",
    matchMode: "contains",
    keywords: ["ORCAMENTO", "CONSULTORIA", "VIP", "CONTATO", "PRECO"],
    replyToComment: true,
    commentReplies: [
      "Te mandei os detalhes no Direct agora! Confere lá 💬",
      "Acabei de te chamar no Direct para te passar tudo! 🚀",
    ],
    requireFollow: true,
    followGateMessage:
      "Olá, {nome}! Que bom ver seu interesse 🚀\n\nAntes de te enviar o atendimento VIP e condições especiais, siga nosso perfil {conta} e clique no botão abaixo:",
    followGateButtonLabel: "✅ Já sigo! Continuar",
    notFollowingMessage:
      "Verifiquei aqui e você ainda não segue {conta} 👀 Siga nosso perfil primeiro e depois clique no botão abaixo para liberar!",
    collectLeadField: "whatsapp",
    collectLeadPrompt:
      "Show! Você já segue nosso perfil ✅\n\nAgora me digita aqui o seu **WhatsApp com DDD** (ex.: 11999999999) para nossa equipe te enviar a proposta e liberar o link:",
    dmMessage:
      "Perfeito, WhatsApp registrado com sucesso! 🎯\n\nVocê também já pode falar direto com nosso time clicando no botão abaixo:",
    dmButtonTitle: "Falar no WhatsApp Agora 💬",
    dmButtonUrl: "https://wa.me/5511999999999",
  });
}

export async function listInstagramAutomations(
  sql: Sql,
  organizationId: string,
  projectId?: string,
): Promise<InstagramAutomationView[]> {
  await seedDefaultAutomationsIfEmpty(sql, organizationId);
  const r = await sql.query(
    `select m.*, a.name as account_name, a.username as account_username
       from instagram_automations m
       join instagram_accounts a on a.id = m.instagram_account_id
      where m.organization_id = $1
        and ($2::uuid is null or m.project_id = $2::uuid or m.project_id is null)
      order by m.created_at asc`,
    [organizationId, projectId ?? null],
  );
  return r.rows.map(mapAutomationRow);
}

export async function upsertInstagramAutomation(
  sql: Sql,
  input: UpsertInstagramAutomationInput,
): Promise<InstagramAutomationView> {
  const name = input.name.trim();
  if (!name) throw new UserFacingError("Dê um nome para a automação.");
  if (!input.dmMessage.trim()) {
    throw new UserFacingError("Informe a mensagem final que será entregue no Direct.");
  }

  const keywords = input.keywords.map((k) => k.trim()).filter(Boolean);
  const commentReplies = input.commentReplies.map((c) => c.trim()).filter(Boolean);

  if (input.id) {
    const r = await sql.query(
      `update instagram_automations
          set instagram_account_id = $3,
              project_id = $4,
              name = $5,
              status = coalesce($6, status),
              trigger_type = $7,
              media_scope = $8,
              target_media_ids = $9::text[],
              match_mode = $10,
              keywords = $11::text[],
              reply_to_comment = $12,
              comment_replies = $13::text[],
              require_follow = $14,
              follow_gate_message = $15,
              follow_gate_button_label = $16,
              not_following_message = $17,
              collect_lead_field = $18,
              collect_lead_prompt = $19,
              dm_message = $20,
              dm_button_title = $21,
              dm_button_url = $22,
              updated_at = now()
        where organization_id = $1 and id = $2
        returning *`,
      [
        input.organizationId,
        input.id,
        input.instagramAccountId,
        input.projectId ?? null,
        name,
        input.status ?? "active",
        input.triggerType,
        input.mediaScope ?? "all_media",
        input.targetMediaIds ?? [],
        input.matchMode,
        keywords,
        input.replyToComment,
        commentReplies,
        input.requireFollow,
        input.followGateMessage.trim(),
        (input.followGateButtonLabel || "✅ Já sigo! Liberar acesso").trim(),
        input.notFollowingMessage.trim(),
        input.collectLeadField ?? "none",
        (input.collectLeadPrompt ?? "").trim(),
        input.dmMessage.trim(),
        (input.dmButtonTitle || "Acessar Agora 🚀").trim(),
        (input.dmButtonUrl ?? "").trim(),
      ],
    );
    if (!r.rows[0]) throw new UserFacingError("Automação não encontrada.");
  } else {
    await sql.query(
      `insert into instagram_automations (
        organization_id, instagram_account_id, project_id, name, status,
        trigger_type, media_scope, target_media_ids, match_mode, keywords,
        reply_to_comment, comment_replies,
        require_follow, follow_gate_message, follow_gate_button_label, not_following_message,
        collect_lead_field, collect_lead_prompt,
        dm_message, dm_button_title, dm_button_url
      ) values (
        $1, $2, $3, $4, $5,
        $6, $7, $8::text[], $9, $10::text[],
        $11, $12::text[],
        $13, $14, $15, $16,
        $17, $18,
        $19, $20, $21
      )`,
      [
        input.organizationId,
        input.instagramAccountId,
        input.projectId ?? null,
        name,
        input.status ?? "active",
        input.triggerType,
        input.mediaScope ?? "all_media",
        input.targetMediaIds ?? [],
        input.matchMode,
        keywords,
        input.replyToComment,
        commentReplies,
        input.requireFollow,
        input.followGateMessage.trim(),
        (input.followGateButtonLabel || "✅ Já sigo! Liberar acesso").trim(),
        input.notFollowingMessage.trim(),
        input.collectLeadField ?? "none",
        (input.collectLeadPrompt ?? "").trim(),
        input.dmMessage.trim(),
        (input.dmButtonTitle || "Acessar Agora 🚀").trim(),
        (input.dmButtonUrl ?? "").trim(),
      ],
    );
  }

  const all = await listInstagramAutomations(sql, input.organizationId);
  return all[all.length - 1]!;
}

export async function toggleInstagramAutomationStatus(
  sql: Sql,
  organizationId: string,
  automationId: string,
  status: "active" | "paused",
): Promise<void> {
  await sql.query(
    "update instagram_automations set status = $3, updated_at = now() where organization_id = $1 and id = $2",
    [organizationId, automationId, status],
  );
}

export async function deleteInstagramAutomation(
  sql: Sql,
  organizationId: string,
  automationId: string,
): Promise<void> {
  await sql.query("delete from instagram_automations where organization_id = $1 and id = $2", [
    organizationId,
    automationId,
  ]);
}

export async function listInstagramAutomationSessions(
  sql: Sql,
  organizationId: string,
  limit = 60,
): Promise<InstagramAutomationSessionView[]> {
  const r = await sql.query(
    `select s.*, m.name as automation_name, a.username as account_username
       from instagram_automation_sessions s
       join instagram_automations m on m.id = s.automation_id
       join instagram_accounts a on a.id = s.instagram_account_id
      where s.organization_id = $1
      order by s.updated_at desc
      limit $2`,
    [organizationId, limit],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    automationId: String(row.automation_id),
    automationName: String(row.automation_name ?? ""),
    instagramAccountId: String(row.instagram_account_id),
    accountUsername: row.account_username ? String(row.account_username) : null,
    igSenderId: String(row.ig_sender_id),
    igUsername: row.ig_username ? String(row.ig_username) : null,
    igName: row.ig_name ? String(row.ig_name) : null,
    sourceType: (row.source_type as InstagramAutomationSessionView["sourceType"]) || "comment",
    externalEventId: row.external_event_id ? String(row.external_event_id) : null,
    triggerText: row.trigger_text ? String(row.trigger_text) : null,
    isFollowing: Boolean(row.is_following),
    stage: (row.stage as SessionStage) || "awaiting_follow",
    leadEmail: row.lead_email ? String(row.lead_email) : null,
    leadWhatsapp: row.lead_whatsapp ? String(row.lead_whatsapp) : null,
    commentReplySent: row.comment_reply_sent ? String(row.comment_reply_sent) : null,
    dmSent: row.dm_sent ? String(row.dm_sent) : null,
    errorPt: row.error_pt ? String(row.error_pt) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
}

/**
 * Consulta na API Oficial da Meta se o usuário do Instagram (`igScopedUserId`) segue a conta profissional (`is_user_follow_business`).
 */
export async function checkIsUserFollowingBusiness(
  igScopedUserId: string,
  accessToken: string,
): Promise<{ isFollowing: boolean; username?: string; name?: string }> {
  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(igScopedUserId)}?fields=name,username,is_user_follow_business,is_business_follow_user&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as {
      is_user_follow_business?: boolean;
      username?: string;
      name?: string;
    };
    if (!res.ok) {
      return { isFollowing: false };
    }
    return {
      isFollowing: Boolean(data.is_user_follow_business),
      ...(data.username ? { username: data.username } : {}),
      ...(data.name ? { name: data.name } : {}),
    };
  } catch {
    return { isFollowing: false };
  }
}

/**
 * Responde publicamente a um comentário no Instagram (`POST /{ig-comment-id}/replies`).
 */
export async function replyToIgComment(
  commentId: string,
  message: string,
  accessToken: string,
): Promise<{ ok: boolean; replyId?: string; error?: string }> {
  try {
    const body = new URLSearchParams({ message, access_token: accessToken });
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(commentId)}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || !data.id) {
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, replyId: data.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Envia mensagem no Direct (via `recipient.id` ou Private Reply via `recipient.comment_id`) com suporte a botões (Quick Replies / Button Template).
 */
export async function sendIgDirectMessage(opts: {
  igUserId: string;
  accessToken: string;
  recipientId?: string;
  commentId?: string;
  text: string;
  buttonTitle?: string;
  buttonUrl?: string;
  quickReplyLabel?: string;
  quickReplyPayload?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const recipient = opts.commentId ? { comment_id: opts.commentId } : { id: opts.recipientId };
    let messagePayload: Record<string, unknown> = { text: opts.text };

    if (opts.buttonUrl && opts.buttonTitle && !opts.commentId) {
      messagePayload = {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: opts.text,
            buttons: [
              {
                type: "web_url",
                url: opts.buttonUrl,
                title: opts.buttonTitle.slice(0, 20),
              },
            ],
          },
        },
      };
    } else if (opts.buttonUrl) {
      messagePayload = {
        text: `${opts.text}\n\n🔗 ${opts.buttonTitle || "Acesse aqui"}: ${opts.buttonUrl}`,
      };
    }

    if (opts.quickReplyLabel && opts.quickReplyPayload && !opts.commentId) {
      messagePayload.quick_replies = [
        {
          content_type: "text",
          title: opts.quickReplyLabel.slice(0, 20),
          payload: opts.quickReplyPayload,
        },
      ];
    }

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(opts.igUserId)}/messages?access_token=${encodeURIComponent(opts.accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient,
          message: messagePayload,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
    if (!res.ok || data.error) {
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, ...(data.message_id ? { messageId: data.message_id } : {}) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface SimulationStepResult {
  session: InstagramAutomationSessionView;
  botMessages: Array<{
    channel: "comment_reply" | "dm";
    text: string;
    buttonTitle?: string;
    buttonUrl?: string;
    quickReplyLabel?: string;
  }>;
}

/**
 * Executa o fluxo de uma automação ManyChat (tanto para eventos reais do Instagram quanto no Simulador Interativo).
 */
export async function executeAutomationFlowStep(
  sql: Sql,
  opts: {
    organizationId: string;
    automationId: string;
    igSenderId: string;
    igUsername?: string;
    igName?: string;
    sourceType: "comment" | "dm" | "story_reply" | "simulation";
    externalEventId?: string;
    commentId?: string;
    inputText: string;
    /** No simulador (ou quando já consultado na Meta), define se o cliente segue ou não o perfil. */
    isFollowingOverride?: boolean;
    /** Ação de botão clicado pelo usuário no Direct (ex.: "check_follow" ou envio de lead). */
    action?: "trigger" | "check_follow" | "submit_lead";
    sessionId?: string;
    encryptionKeyRaw?: string;
  },
): Promise<SimulationStepResult> {
  const autoRes = await sql.query(
    `select m.*, a.name as account_name, a.username as account_username, a.ig_user_id, a.access_token_enc
       from instagram_automations m
       join instagram_accounts a on a.id = m.instagram_account_id
      where m.organization_id = $1 and m.id = $2`,
    [opts.organizationId, opts.automationId],
  );
  const row = autoRes.rows[0];
  if (!row) throw new UserFacingError("Automação não encontrada.");

  const auto = mapAutomationRow(row);
  const accessToken = decodeInstagramToken(String(row.access_token_enc), opts.encryptionKeyRaw);
  const igBusinessId = String(row.ig_user_id);
  const isReal = opts.sourceType !== "simulation";

  let isFollowing = opts.isFollowingOverride ?? false;
  let resolvedUsername = opts.igUsername || "seguidor.teste";
  let resolvedName = opts.igName || resolvedUsername;

  if (isReal && opts.igSenderId && opts.isFollowingOverride === undefined) {
    const check = await checkIsUserFollowingBusiness(opts.igSenderId, accessToken);
    isFollowing = check.isFollowing;
    if (check.username) resolvedUsername = check.username;
    if (check.name) resolvedName = check.name;
  }

  const vars = {
    username: resolvedUsername,
    name: resolvedName,
    conta: auto.accountUsername || auto.accountName,
  };

  const botMessages: SimulationStepResult["botMessages"] = [];

  // Caso 1: Verificação do botão "✅ Já sigo! Liberar acesso"
  if (opts.action === "check_follow" && opts.sessionId) {
    if (!isFollowing) {
      const notFollowingText = interpolateTemplate(
        auto.notFollowingMessage ||
          "Olhei aqui no sistema e parece que você ainda não está seguindo {conta} 👀\n\nSiga nosso perfil {conta} e depois toque no botão abaixo novamente!",
        vars,
      );
      if (isReal) {
        await sendIgDirectMessage({
          igUserId: igBusinessId,
          accessToken,
          recipientId: opts.igSenderId,
          text: notFollowingText,
          quickReplyLabel: auto.followGateButtonLabel,
          quickReplyPayload: `CHECK_FOLLOW:${opts.sessionId}`,
        });
      }
      botMessages.push({
        channel: "dm",
        text: notFollowingText,
        quickReplyLabel: auto.followGateButtonLabel,
      });

      await sql.query(
        "update instagram_automation_sessions set is_following = false, stage = 'awaiting_follow', dm_sent = $3, updated_at = now() where organization_id = $1 and id = $2",
        [opts.organizationId, opts.sessionId, notFollowingText],
      );
    } else {
      // Passou na trava de seguidor!
      await sql.query(
        "update instagram_automations set followers_gained_count = followers_gained_count + 1, dms_sent_count = dms_sent_count + 1, updated_at = now() where organization_id = $1 and id = $2",
        [opts.organizationId, auto.id],
      );

      if (auto.collectLeadField !== "none") {
        const promptText = interpolateTemplate(
          auto.collectLeadPrompt ||
            (auto.collectLeadField === "whatsapp"
              ? "Confirmado que você já nos segue! ✅ Qual é o seu WhatsApp com DDD para eu liberar seu acesso?"
              : "Confirmado que você já nos segue! ✅ Digite seu melhor e-mail para eu liberar seu acesso:"),
          vars,
        );
        if (isReal) {
          await sendIgDirectMessage({
            igUserId: igBusinessId,
            accessToken,
            recipientId: opts.igSenderId,
            text: promptText,
          });
        }
        botMessages.push({ channel: "dm", text: promptText });
        await sql.query(
          "update instagram_automation_sessions set is_following = true, stage = 'awaiting_lead_input', dm_sent = $3, updated_at = now() where organization_id = $1 and id = $2",
          [opts.organizationId, opts.sessionId, promptText],
        );
      } else {
        const finalDm = interpolateTemplate(auto.dmMessage, vars);
        if (isReal) {
          await sendIgDirectMessage({
            igUserId: igBusinessId,
            accessToken,
            recipientId: opts.igSenderId,
            text: finalDm,
            ...(auto.dmButtonUrl ? { buttonTitle: auto.dmButtonTitle, buttonUrl: auto.dmButtonUrl } : {}),
          });
        }
        botMessages.push({
          channel: "dm",
          text: finalDm,
          ...(auto.dmButtonUrl ? { buttonTitle: auto.dmButtonTitle, buttonUrl: auto.dmButtonUrl } : {}),
        });
        await sql.query(
          "update instagram_automation_sessions set is_following = true, stage = 'delivered', dm_sent = $3, updated_at = now() where organization_id = $1 and id = $2",
          [opts.organizationId, opts.sessionId, finalDm],
        );
      }
    }

    const sessions = await listInstagramAutomationSessions(sql, opts.organizationId, 20);
    return {
      session: sessions.find((s) => s.id === opts.sessionId) ?? sessions[0]!,
      botMessages,
    };
  }

  // Caso 2: Submissão de Lead (WhatsApp ou E-mail)
  if (opts.action === "submit_lead" && opts.sessionId) {
    const cleanLead = opts.inputText.trim();
    const isEmail = auto.collectLeadField === "email";
    const finalDm = interpolateTemplate(auto.dmMessage, vars);

    if (isReal) {
      await sendIgDirectMessage({
        igUserId: igBusinessId,
        accessToken,
        recipientId: opts.igSenderId,
        text: finalDm,
        ...(auto.dmButtonUrl ? { buttonTitle: auto.dmButtonTitle, buttonUrl: auto.dmButtonUrl } : {}),
      });
    }
    botMessages.push({
      channel: "dm",
      text: finalDm,
      ...(auto.dmButtonUrl ? { buttonTitle: auto.dmButtonTitle, buttonUrl: auto.dmButtonUrl } : {}),
    });

    await sql.query(
      `update instagram_automation_sessions
          set stage = 'delivered',
              lead_email = case when $3 = 'email' then $4 else lead_email end,
              lead_whatsapp = case when $3 = 'whatsapp' then $4 else lead_whatsapp end,
              dm_sent = $5,
              updated_at = now()
        where organization_id = $1 and id = $2`,
      [opts.organizationId, opts.sessionId, auto.collectLeadField, cleanLead, finalDm],
    );
    await sql.query(
      "update instagram_automations set leads_captured_count = leads_captured_count + 1, dms_sent_count = dms_sent_count + 1, updated_at = now() where organization_id = $1 and id = $2",
      [opts.organizationId, auto.id],
    );

    const sessions = await listInstagramAutomationSessions(sql, opts.organizationId, 20);
    return {
      session: sessions.find((s) => s.id === opts.sessionId) ?? sessions[0]!,
      botMessages,
    };
  }

  // Caso 3: Gatilho Inicial (Comentário no Reel/Post, Direct ou Story)
  let commentReplySent: string | null = null;
  if ((opts.sourceType === "comment" || opts.sourceType === "simulation") && auto.replyToComment && auto.commentReplies.length > 0) {
    const idx = auto.triggersCount % auto.commentReplies.length;
    const rawReply = auto.commentReplies[idx]!;
    commentReplySent = interpolateTemplate(`@${resolvedUsername.replace(/^@/, "")} ${rawReply}`, vars);
    if (isReal && opts.commentId) {
      await replyToIgComment(opts.commentId, commentReplySent, accessToken);
    }
    botMessages.push({
      channel: "comment_reply",
      text: commentReplySent,
    });
  }

  let initialStage: SessionStage = "delivered";
  let dmSentText = "";

  if (auto.requireFollow && !isFollowing) {
    initialStage = "awaiting_follow";
    dmSentText = interpolateTemplate(
      auto.followGateMessage ||
        "Opa, {nome}! Antes de liberar seu link, siga nosso perfil {conta} e toque no botão abaixo:",
      vars,
    );
    botMessages.push({
      channel: "dm",
      text: dmSentText,
      quickReplyLabel: auto.followGateButtonLabel,
    });
  } else if (auto.collectLeadField !== "none") {
    initialStage = "awaiting_lead_input";
    dmSentText = interpolateTemplate(
      auto.collectLeadPrompt ||
        "Perfeito! Qual é o seu WhatsApp com DDD para eu liberar o acesso?",
      vars,
    );
    botMessages.push({
      channel: "dm",
      text: dmSentText,
    });
  } else {
    initialStage = "delivered";
    dmSentText = interpolateTemplate(auto.dmMessage, vars);
    botMessages.push({
      channel: "dm",
      text: dmSentText,
      ...(auto.dmButtonUrl ? { buttonTitle: auto.dmButtonTitle, buttonUrl: auto.dmButtonUrl } : {}),
    });
  }

  const ins = await sql.query<{ id: string }>(
    `insert into instagram_automation_sessions (
      organization_id, automation_id, instagram_account_id,
      ig_sender_id, ig_username, ig_name, source_type, external_event_id,
      trigger_text, is_following, stage, comment_reply_sent, dm_sent
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    on conflict (organization_id, external_event_id) where external_event_id is not null
    do update set updated_at = now()
    returning id`,
    [
      opts.organizationId,
      auto.id,
      auto.instagramAccountId,
      opts.igSenderId,
      resolvedUsername,
      resolvedName,
      opts.sourceType,
      opts.externalEventId ?? null,
      opts.inputText,
      isFollowing,
      initialStage,
      commentReplySent,
      dmSentText,
    ],
  );
  const newSessionId = ins.rows[0]!.id;

  if (isReal) {
    await sendIgDirectMessage({
      igUserId: igBusinessId,
      accessToken,
      ...(opts.commentId ? { commentId: opts.commentId } : { recipientId: opts.igSenderId }),
      text: dmSentText,
      ...(initialStage === "delivered" && auto.dmButtonUrl
        ? { buttonTitle: auto.dmButtonTitle, buttonUrl: auto.dmButtonUrl }
        : {}),
      ...(initialStage === "awaiting_follow"
        ? { quickReplyLabel: auto.followGateButtonLabel, quickReplyPayload: `CHECK_FOLLOW:${newSessionId}` }
        : {}),
    });
  }

  await sql.query(
    `update instagram_automations
        set triggers_count = triggers_count + 1,
            comment_replies_count = comment_replies_count + $3,
            dms_sent_count = dms_sent_count + 1,
            updated_at = now()
      where organization_id = $1 and id = $2`,
    [opts.organizationId, auto.id, commentReplySent ? 1 : 0],
  );

  const sessions = await listInstagramAutomationSessions(sql, opts.organizationId, 20);
  return {
    session: sessions.find((s) => s.id === newSessionId) ?? sessions[0]!,
    botMessages,
  };
}

/**
 * Varre comentários reais nos últimos Reels/Posts da conta na Meta Graph API e dispara as automações ativas.
 * Funciona tanto em localhost quanto em produção sem depender de Webhook!
 */
export async function syncAndReplyRecentInstagramComments(
  sql: Sql,
  opts: {
    organizationId: string;
    instagramAccountId?: string;
    encryptionKeyRaw?: string;
  },
): Promise<{ checkedMedia: number; triggeredCount: number }> {
  const automations = (await listInstagramAutomations(sql, opts.organizationId)).filter(
    (a) =>
      a.status === "active" &&
      (a.triggerType === "comment" || a.triggerType === "any") &&
      (!opts.instagramAccountId || a.instagramAccountId === opts.instagramAccountId),
  );
  if (automations.length === 0) return { checkedMedia: 0, triggeredCount: 0 };

  const accountIds = Array.from(new Set(automations.map((a) => a.instagramAccountId)));
  let checkedMedia = 0;
  let triggeredCount = 0;

  for (const accId of accountIds) {
    const accRes = await sql.query<{ ig_user_id: string; username: string | null; access_token_enc: string }>(
      "select ig_user_id, username, access_token_enc from instagram_accounts where organization_id = $1 and id = $2",
      [opts.organizationId, accId],
    );
    const acc = accRes.rows[0];
    if (!acc) continue;

    const token = decodeInstagramToken(acc.access_token_enc, opts.encryptionKeyRaw);
    const mediaUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(acc.ig_user_id)}/media?fields=id,caption,permalink,comments.limit(20){id,text,username,from,timestamp}&limit=10&access_token=${encodeURIComponent(token)}`;
    const mediaRes = await fetch(mediaUrl);
    const mediaData = (await mediaRes.json().catch(() => ({}))) as {
      data?: Array<{
        id: string;
        comments?: {
          data?: Array<{
            id: string;
            text?: string;
            username?: string;
            from?: { id?: string; username?: string };
          }>;
        };
      }>;
    };

    const mediaList = mediaData.data ?? [];
    checkedMedia += mediaList.length;

    const accAutomations = automations.filter((a) => a.instagramAccountId === accId);

    for (const media of mediaList) {
      const comments = media.comments?.data ?? [];
      for (const c of comments) {
        const text = (c.text ?? "").trim();
        if (!text) continue;
        const commenterUsername = c.username || c.from?.username || "";
        // Ignora comentários feitos pela própria conta comercial
        if (acc.username && commenterUsername.toLowerCase() === acc.username.toLowerCase()) continue;

        const externalEventId = `comment:${c.id}`;
        const already = await sql.query<{ id: string }>(
          "select id from instagram_automation_sessions where organization_id = $1 and external_event_id = $2",
          [opts.organizationId, externalEventId],
        );
        if (already.rows[0]) continue;

        const matchedAuto = accAutomations.find((a) => {
          if (a.mediaScope === "specific_media" && a.targetMediaIds.length > 0 && !a.targetMediaIds.includes(media.id)) {
            return false;
          }
          return matchesAutomationKeywords(text, a.matchMode, a.keywords);
        });
        if (!matchedAuto) continue;

        await executeAutomationFlowStep(sql, {
          organizationId: opts.organizationId,
          automationId: matchedAuto.id,
          igSenderId: c.from?.id || commenterUsername || c.id,
          igUsername: commenterUsername || "seguidor",
          sourceType: "comment",
          externalEventId,
          commentId: c.id,
          inputText: text,
          action: "trigger",
          ...(opts.encryptionKeyRaw ? { encryptionKeyRaw: opts.encryptionKeyRaw } : {}),
        });
        triggeredCount++;
      }
    }
  }

  return { checkedMedia, triggeredCount };
}
