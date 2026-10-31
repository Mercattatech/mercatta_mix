import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Confirmar entrada", robots: { index: false } };

/** O link do e-mail abre esta página; só o clique no botão (POST) gasta o link — assim scanners de e-mail não o consomem. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="animate-in glass w-full max-w-md space-y-5 p-8 text-center">
        <p className="font-display text-3xl font-semibold">
          <span className="gradient-text">Mercatta Mix</span>
        </p>
        {token ? (
          <form action="/api/auth/verify" method="post" className="space-y-4">
            <h1 className="font-display text-xl font-medium">Tudo certo para entrar</h1>
            <p className="text-sm text-muted">Clique no botão para abrir a sua conta neste navegador.</p>
            <input type="hidden" name="token" value={token} />
            <button id="confirm-login" type="submit" className="btn-glow h-12 w-full rounded-xl px-6 text-base font-medium text-white">
              Entrar
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <h1 className="font-display text-xl font-medium">Link incompleto</h1>
            <p className="text-sm text-muted">Peça um novo link na tela de entrada.</p>
            <Link href="/login" className="text-sm underline underline-offset-4">
              Ir para a entrada
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
