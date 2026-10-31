import { NextResponse } from "next/server";
import { consumeLoginLink } from "@mercatta/server";
import { startSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/**
 * Passo 2 do login: troca o link (token) por uma sessão. É POST de propósito: o GET do link só mostra um botão
 * (ver /auth/verify), porque antivírus e leitores de e-mail abrem links sozinhos e gastariam o uso único.
 */
export async function POST(req: Request) {
  const base = serverEnv().APP_URL;
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const userId = await consumeLoginLink(getDb(), token);
  if (!userId) return NextResponse.redirect(`${base}/login?erro=link`, 303);
  await startSession(userId);
  return NextResponse.redirect(`${base}/projects`, 303);
}
