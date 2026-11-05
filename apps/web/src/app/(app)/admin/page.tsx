import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getAppContext } from "@/lib/context";
import { AdminForms } from "./admin-forms";

export const metadata: Metadata = { title: "Admin" };

interface OrgRow {
  id: string;
  name: string;
  status: string;
  members: string;
  projects: string;
  balance: string;
}

export default async function AdminPage() {
  const ctx = await getAppContext();
  if (!ctx.isAdmin) notFound();

  const { rows } = await getDb().query<OrgRow>(
    `select o.id, o.name, o.status,
            (select count(*) from memberships m where m.organization_id = o.id) as members,
            (select count(*) from projects p where p.organization_id = o.id) as projects,
            credit_balance(o.id) as balance
       from organizations o order by o.created_at desc`,
  );

  return (
    <div className="animate-in space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Admin da plataforma</h1>
        <p className="mt-1 text-muted">Crie empresas clientes, convide pessoas (acesso só por convite) e dê créditos.</p>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">E-mail (SMTP)</p>
          <p className="text-xs text-muted">Escolha o servidor que envia os links de acesso e convites (Gmail, Hostinger, Resend, qualquer SMTP).</p>
        </div>
        <Link id="open-mail-settings" href="/admin/email" className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium transition hover:bg-surface-2">
          Configurar e-mail
        </Link>
      </Card>

      <AdminForms orgs={rows.map((o) => ({ id: o.id, name: o.name }))} />

      <section aria-labelledby="orgs-title" className="space-y-3">
        <h2 id="orgs-title" className="font-display text-xl font-semibold">
          Empresas ({rows.length})
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((o) => (
            <li key={o.id}>
              <Card className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.name}</p>
                  <p className="text-xs text-muted">
                    {o.members} pessoa(s) · {o.projects} projeto(s)
                  </p>
                </div>
                <Badge tone="primary">✦ {Number(o.balance)} créditos</Badge>
              </Card>
            </li>
          ))}
          {rows.length === 0 && <li className="text-sm text-muted">Nenhuma empresa ainda. Crie a primeira acima.</li>}
        </ul>
      </section>
    </div>
  );
}
