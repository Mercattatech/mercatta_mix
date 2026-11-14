import { NextResponse, type NextRequest } from "next/server";

/**
 * Acesso direto habilitado: não exige redirecionamento para tela de login/senha.
 * A resolução automática do usuário padrão acontece em `currentUser()` (`src/lib/auth.ts`).
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
