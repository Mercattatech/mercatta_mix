import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseForUser } from "@/lib/auth";

const OTP_TYPES: readonly EmailOtpType[] = ["invite", "magiclink", "recovery", "signup", "email", "email_change"];

/**
 * Retorno dos links de e-mail (convite, link de acesso, recuperar senha): troca o código pela sessão.
 * Aceita `?code=` (PKCE) e `?token_hash=&type=` (template de e-mail do Supabase — é o formato do convite do admin).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/projects";
  // só caminhos internos (evita redirecionamento para sites de terceiros)
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/projects";
  const supabase = await supabaseForUser();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?erro=link`);
}
