import type { Metadata } from "next";
import Link from "next/link";
import {
  listInstagramAccounts,
  listInstagramAutomationSessions,
  listInstagramAutomations,
} from "@mercatta/server";
import { Alert } from "@/components/ui";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";
import { AutomationsStudio } from "./automations-studio";

export const metadata: Metadata = {
  title: "Automações Mix — Comentários, Direct e Trava de Seguidor",
};

export default async function AutomationsPage() {
  const ctx = await getAppContext();
  if (!ctx.organization) {
    return (
      <Alert tone="warn">
        Sua conta ainda não está vinculada a uma empresa.{" "}
        {ctx.isAdmin ? (
          <Link className="underline" href="/admin">
            Crie uma empresa no painel Admin.
          </Link>
        ) : null}
      </Alert>
    );
  }

  const db = getDb();
  const orgId = ctx.organization.id;
  const [accounts, automations, sessions] = await Promise.all([
    listInstagramAccounts(db, orgId),
    listInstagramAutomations(db, orgId),
    listInstagramAutomationSessions(db, orgId, 60),
  ]);

  const baseAppUrl = (process.env.APP_URL || "https://growth.grupomercatta.com.br").replace(/\/$/, "");
  const webhookUrl = `${baseAppUrl}/api/instagram/webhook`;

  return (
    <div className="animate-in">
      <AutomationsStudio
        accounts={accounts}
        initialAutomations={automations}
        initialSessions={sessions}
        webhookUrl={webhookUrl}
      />
    </div>
  );
}

