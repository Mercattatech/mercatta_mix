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

  const base = (process.env.META_REDIRECT_BASE || serverEnv().APP_URL || url.origin).replace(/\/$/, "");
  const redirectUri = `${base}/api/instagram/oauth/callback`;
  const state = Buffer.from(JSON.stringify({ returnTo }), "utf8").toString("base64url");

  return NextResponse.redirect(buildInstagramOAuthUrl(config, redirectUri, state), 302);
}

export function POST(req: Request) {
  return handle(async () => {
    const ctx = await getAppContext();
    if (!ctx.isAdmin) throw new Error("Apenas administradores podem configurar o App OAuth da Meta.");
    const body = (await req.json()) as { appId?: string; appSecret?: string; configId?: string };
    await saveInstagramOAuthConfig(getDb(), {
      appId: body.appId ?? "24795114410148961",
      appSecret: body.appSecret ?? "",
      ...(body.configId ? { configId: body.configId } : {}),
    });
    return { ok: true };
  });
}
