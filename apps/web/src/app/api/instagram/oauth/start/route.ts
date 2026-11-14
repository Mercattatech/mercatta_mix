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

  if (!config) {
    return NextResponse.redirect(new URL(`/instagram/connect?returnTo=${encodeURIComponent(returnTo)}`, req.url), 302);
  }

  const redirectUri = `${serverEnv().APP_URL.replace(/\/$/, "")}/api/instagram/oauth/callback`;
  const state = Buffer.from(JSON.stringify({ returnTo }), "utf8").toString("base64url");
  return NextResponse.redirect(buildInstagramOAuthUrl(config, redirectUri, state), 302);
}

export function POST(req: Request) {
  return handle(async () => {
    const ctx = await getAppContext();
    if (!ctx.isAdmin) throw new Error("Apenas administradores podem configurar o App OAuth da Meta.");
    const body = (await req.json()) as { appId?: string; appSecret?: string };
    await saveInstagramOAuthConfig(getDb(), {
      appId: body.appId ?? "",
      appSecret: body.appSecret ?? "",
    });
    return { ok: true };
  });
}

