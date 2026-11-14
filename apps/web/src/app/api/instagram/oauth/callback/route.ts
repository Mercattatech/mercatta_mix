import { NextResponse } from "next/server";
import { exchangeInstagramOAuthCode, getInstagramOAuthConfig } from "@mercatta/server";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state") || "";
  let returnTo = "/instagram";
  try {
    const decoded = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8")) as { returnTo?: string };
    if (decoded.returnTo?.startsWith("/")) returnTo = decoded.returnTo;
  } catch {
    // mantém /instagram
  }

  if (!code) {
    return NextResponse.redirect(new URL(`${returnTo}?ig_error=cancelado`, req.url), 302);
  }

  try {
    const ctx = await getAppContext();
    if (!ctx.organization) {
      return NextResponse.redirect(new URL("/projects", req.url), 302);
    }
    const db = getDb();
    const config = await getInstagramOAuthConfig(db);
    if (!config.appSecret) {
      return NextResponse.redirect(
        new URL(
          `/instagram/connect?returnTo=${encodeURIComponent(returnTo)}&code=${encodeURIComponent(code)}&erro=${encodeURIComponent("Permissão do Instagram autorizada com sucesso! Cole apenas a Chave Secreta do Aplicativo (App Secret) abaixo para finalizar.")}`,
          req.url,
        ),
        302,
      );
    }
    const rawBase = process.env.META_REDIRECT_BASE || (url.origin.includes("localhost") ? "https://9b0f52fcf4d3e4.app.lhr.life" : url.origin);
    const base = rawBase.replace(/\/$/, "");
    const redirectUri = `${base}${url.pathname}`;
    await exchangeInstagramOAuthCode(db, {
      organizationId: ctx.organization.id,
      code,
      redirectUri,
      config,
      encryptionKeyRaw: serverEnv().SETTINGS_ENCRYPTION_KEY,
    });
    return NextResponse.redirect(new URL(`${returnTo}?ig_connected=1`, req.url), 302);
  } catch (e) {
    const msg = (e as Error).message || "Falha ao conectar conta do Instagram";
    return NextResponse.redirect(new URL(`/instagram/connect?returnTo=${encodeURIComponent(returnTo)}&erro=${encodeURIComponent(msg)}`, req.url), 302);
  }
}
