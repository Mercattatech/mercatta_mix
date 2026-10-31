import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Criar senha" };

export default async function SetPasswordPage() {
  await requireUser();
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="animate-in glass w-full max-w-md p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold">Crie sua senha</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Bem-vindo ao Mercatta Mix! Defina uma senha para os próximos acessos.</p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
