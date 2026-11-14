import { NextResponse } from "next/server";
import { buildInstagramOAuthUrl, getInstagramOAuthConfig, saveInstagramOAuthConfig } from "@mercatta/server";
import { handle } from "@/lib/api";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") || "/instagram";
  const db = getDb();
  const config = await getInstagramOAuthConfig(db);

  const rawBase = process.env.META_REDIRECT_BASE || (url.origin.includes("localhost") ? "https://9b0f52fcf4d3e4.app.lhr.life" : url.origin);
  const base = rawBase.replace(/\/$/, "");
  const redirectUri = `${base}/api/instagram/oauth/callback`;
  const state = Buffer.from(JSON.stringify({ returnTo }), "utf8").toString("base64url");

  return NextResponse.redirect(buildInstagramOAuthUrl(config, redirectUri, state), 302);
}

export function POST(req: Request) {
  return handle(async () => {
    const ctx = await getAppContext();
    if (!ctx.isAdmin) throw new Error("Apenas administradores podem configurar o App OAuth da Meta.");
    const body = (await req.json()) as { appId?: string; appSecret?: string; configId?: string; code?: string };
    const db = getDb();
    await saveInstagramOAuthConfig(db, {
      appId: body.appId ?? "24795114410148961",
      appSecret: body.appSecret ?? "",
      ...(body.configId ? { configId: body.configId } : {}),
    });
    if (body.code && ctx.organization) {
      const { exchangeInstagramOAuthCode } = await import("@mercatta/server");
      const config = await getInstagramOAuthConfig(db);
      const rawCode = body.code.includes("code=")
        ? new URL(body.code.startsWith("http") ? body.code : `https://${body.code}`).searchParams.get("code") || body.code
        : body.code;
      const cleanCode = rawCode.replace(/#_$/, "").trim();
      await exchangeInstagramOAuthCode(db, {
        organizationId: ctx.organization.id,
        code: cleanCode,
        redirectUri: "https://9b0f52fcf4d3e4.app.lhr.life/api/instagram/oauth/callback",
        config,
        encryptionKeyRaw: serverEnv().SETTINGS_ENCRYPTION_KEY,
      });
      return { ok: true, exchanged: true };
    }
    return { ok: true, exchanged: false };
  });
}
