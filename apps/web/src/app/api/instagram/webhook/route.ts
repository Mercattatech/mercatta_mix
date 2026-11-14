import { NextResponse } from "next/server";
import { executeAutomationFlowStep, listInstagramAutomations, matchesAutomationKeywords } from "@mercatta/server";
import { getDb } from "@/lib/db";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || "mercatta_mix_webhook_2026";

/**
 * Validação oficial do Webhook da Meta (GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ ok: true, verifyToken: VERIFY_TOKEN });
}

/**
 * Recebe eventos em tempo real da Meta Graph API (Comentários, Directs e cliques no botão "Já sigo!").
 */
export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => ({}))) as {
      object?: string;
      entry?: Array<{
        id?: string;
        changes?: Array<{
          field?: string;
          value?: {
            id?: string;
            text?: string;
            from?: { id?: string; username?: string };
            media?: { id?: string };
          };
        }>;
        messaging?: Array<{
          sender?: { id?: string };
          recipient?: { id?: string };
          message?: { mid?: string; text?: string; quick_reply?: { payload?: string } };
          postback?: { payload?: string; title?: string };
        }>;
      }>;
    };

    const db = getDb();
    const encKey = process.env.SETTINGS_ENCRYPTION_KEY;

    for (const entry of payload.entry ?? []) {
      const igBusinessId = String(entry.id || "");
      if (!igBusinessId) continue;

      const accRes = await db.query<{ id: string; organization_id: string; username: string | null }>(
        "select id, organization_id, username from instagram_accounts where ig_user_id = $1 limit 1",
        [igBusinessId],
      );
      const acc = accRes.rows[0];
      if (!acc) continue;

      const automations = (await listInstagramAutomations(db, acc.organization_id)).filter(
        (a) => a.status === "active" && a.instagramAccountId === acc.id,
      );
      if (automations.length === 0) continue;

      // 1. Eventos de Comentário em Post/Reels
      for (const ch of entry.changes ?? []) {
        if (ch.field !== "comments" || !ch.value) continue;
        const commentId = ch.value.id;
        const text = (ch.value.text ?? "").trim();
        const senderId = ch.value.from?.id || "";
        const senderUsername = ch.value.from?.username || "";
        const mediaId = ch.value.media?.id || "";

        if (!commentId || !text) continue;
        if (acc.username && senderUsername.toLowerCase() === acc.username.toLowerCase()) continue;

        const matched = automations.find((a) => {
          if (a.triggerType !== "comment" && a.triggerType !== "any") return false;
          if (a.mediaScope === "specific_media" && a.targetMediaIds.length > 0 && !a.targetMediaIds.includes(mediaId)) {
            return false;
          }
          return matchesAutomationKeywords(text, a.matchMode, a.keywords);
        });
        if (!matched) continue;

        await executeAutomationFlowStep(db, {
          organizationId: acc.organization_id,
          automationId: matched.id,
          igSenderId: senderId || senderUsername,
          igUsername: senderUsername,
          sourceType: "comment",
          externalEventId: `comment:${commentId}`,
          commentId,
          inputText: text,
          action: "trigger",
          ...(encKey ? { encryptionKeyRaw: encKey } : {}),
        });
      }

      // 2. Eventos de Direct (Mensagens, Quick Replies de "Já sigo!" e Captura de Lead)
      for (const msg of entry.messaging ?? []) {
        const senderId = msg.sender?.id || "";
        if (!senderId || senderId === igBusinessId) continue;

        const qrPayload = msg.message?.quick_reply?.payload || msg.postback?.payload || "";
        const text = (msg.message?.text ?? "").trim();

        // Cliques no botão "✅ Já sigo! Liberar acesso"
        if (qrPayload.startsWith("CHECK_FOLLOW:")) {
          const sessionId = qrPayload.replace("CHECK_FOLLOW:", "").trim();
          const sessRes = await db.query<{ automation_id: string }>(
            "select automation_id from instagram_automation_sessions where organization_id = $1 and id = $2",
            [acc.organization_id, sessionId],
          );
          const sess = sessRes.rows[0];
          if (sess) {
            await executeAutomationFlowStep(db, {
              organizationId: acc.organization_id,
              automationId: sess.automation_id,
              igSenderId: senderId,
              sourceType: "dm",
              inputText: text || "CHECK_FOLLOW",
              action: "check_follow",
              sessionId,
              ...(encKey ? { encryptionKeyRaw: encKey } : {}),
            });
            continue;
          }
        }

        // Verifica se o usuário tem uma sessão ativa aguardando seguidor ou aguardando WhatsApp/E-mail
        const activeSessRes = await db.query<{ id: string; automation_id: string; stage: string }>(
          `select id, automation_id, stage
             from instagram_automation_sessions
            where organization_id = $1
              and instagram_account_id = $2
              and ig_sender_id = $3
              and stage in ('awaiting_follow', 'awaiting_lead_input')
            order by updated_at desc
            limit 1`,
          [acc.organization_id, acc.id, senderId],
        );
        const activeSess = activeSessRes.rows[0];

        if (activeSess?.stage === "awaiting_follow" && /sigo|segui|pronto|ja|libera/i.test(text)) {
          await executeAutomationFlowStep(db, {
            organizationId: acc.organization_id,
            automationId: activeSess.automation_id,
            igSenderId: senderId,
            sourceType: "dm",
            inputText: text,
            action: "check_follow",
            sessionId: activeSess.id,
            ...(encKey ? { encryptionKeyRaw: encKey } : {}),
          });
          continue;
        }

        if (activeSess?.stage === "awaiting_lead_input" && text.length >= 5) {
          await executeAutomationFlowStep(db, {
            organizationId: acc.organization_id,
            automationId: activeSess.automation_id,
            igSenderId: senderId,
            sourceType: "dm",
            inputText: text,
            action: "submit_lead",
            sessionId: activeSess.id,
            ...(encKey ? { encryptionKeyRaw: encKey } : {}),
          });
          continue;
        }

        // Gatilho de DM por palavra-chave
        if (text) {
          const matchedDm = automations.find((a) => {
            if (a.triggerType !== "dm" && a.triggerType !== "any") return false;
            return matchesAutomationKeywords(text, a.matchMode, a.keywords);
          });
          if (matchedDm) {
            await executeAutomationFlowStep(db, {
              organizationId: acc.organization_id,
              automationId: matchedDm.id,
              igSenderId: senderId,
              sourceType: "dm",
              ...(msg.message?.mid ? { externalEventId: `dm:${msg.message.mid}` } : {}),
              inputText: text,
              action: "trigger",
              ...(encKey ? { encryptionKeyRaw: encKey } : {}),
            });
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    return NextResponse.json({ received: true, warning: (e as Error).message });
  }
}

