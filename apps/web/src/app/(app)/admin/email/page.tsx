import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMailSettings } from "@mercatta/server";
import { Alert } from "@/components/ui";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { MailForm } from "./mail-form";

export const metadata: Metadata = { title: "E-mail (SMTP)" };

export default async function MailSettingsPage() {
  const ctx = await getAppContext();
  if (!ctx.isAdmin) notFound();

  const settings = await getMailSettings(getDb());
  const env = serverEnv();
  const keyConfigured = Boolean(env.SETTINGS_ENCRYPTION_KEY?.trim());

  return (
    <div className="animate-in mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-fg">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">E-mail (SMTP)</h1>
        <p className="mt-1 text-muted">
          Escolha o provedor que envia os links de acesso e convites. Funciona com qualquer servidor SMTP. A senha é guardada cifrada e nunca volta para a tela.
        </p>
      </div>

      {!keyConfigured && (
        <Alert tone="warn">
          Falta a variável <code>SETTINGS_ENCRYPTION_KEY</code> no ambiente do servidor; sem ela não é possível salvar a senha. Gere uma com <code>openssl rand -base64 32</code>, coloque no <code>.env</code> e reinicie.
        </Alert>
      )}

      <MailForm
        keyConfigured={keyConfigured}
        adminEmail={ctx.user.email}
        initial={
          settings
            ? { ...settings, updatedAt: settings.updatedAt.toISOString(), lastTestAt: settings.lastTestAt?.toISOString() ?? null }
            : null
        }
        envFallback={env.MAIL_DRIVER}
      />
    </div>
  );
}
