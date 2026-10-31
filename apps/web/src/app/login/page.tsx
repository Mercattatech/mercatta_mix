import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  if (await currentUser()) redirect("/projects");
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="animate-in w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-display text-sm tracking-[0.3em] text-muted uppercase">Grupo Mercatta</p>
          <h1 className="font-display mt-2 text-5xl font-semibold tracking-tight">
            <span className="gradient-text">Mercatta Mix</span>
          </h1>
          <p className="mt-3 text-muted">Grave 30 vídeos. Publique 1.000 conteúdos.</p>
        </div>
        <div className="glass p-6 sm:p-8">
          <h2 className="font-display mb-5 text-xl font-medium">Entre na sua conta</h2>
          <LoginForm linkError={erro === "link"} />
        </div>
        <p className="mt-6 text-center text-xs text-muted">Acesso por convite. Ainda não recebeu o seu? Fale com o seu contato no Grupo Mercatta.</p>
      </div>
    </main>
  );
}
