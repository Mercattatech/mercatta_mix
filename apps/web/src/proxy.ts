import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mm_session";
const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Porteiro rápido: sem cookie de sessão, manda para o login. NÃO valida o cookie (isso exige o banco):
 * a validação de verdade acontece em cada página (requireUser) e em cada rota de API (requireApiUser).
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const hasCookie = request.cookies.has(SESSION_COOKIE);

  if (!hasCookie && !isPublic && !path.startsWith("/api/")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
