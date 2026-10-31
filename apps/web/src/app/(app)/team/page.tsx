import type { Metadata } from "next";
import { Alert, Badge, Card } from "@/components/ui";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Equipe" };

const ROLE_LABEL: Record<string, string> = { owner: "Dono", editor: "Editor", aprovador: "Aprovador" };
const ROLE_HINT: Record<string, string> = {
  owner: "Faz tudo, inclusive gerenciar a equipe",
  editor: "Cria projetos e gera vídeos",
  aprovador: "Vê e baixa; não altera",
};

export default async function TeamPage() {
  const ctx = await getAppContext();
  if (!ctx.organization) return <Alert tone="warn">Sua conta ainda não está vinculada a uma empresa.</Alert>;

  const { rows: members } = await getDb().query<{ id: string; role: string; email: string; name: string | null }>(
    `select m.id, m.role, u.email, u.name
       from memberships m join users u on u.id = m.user_id
      where m.organization_id = $1
      order by m.created_at asc`,
    [ctx.organization.id],
  );

  return (
    <div className="animate-in space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Equipe</h1>
        <p className="mt-1 text-muted">
          {ctx.organization.name} · {members.length} de 3 pessoas. Para convidar ou trocar alguém, fale com o Grupo Mercatta.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <li key={m.id}>
            <Card className="h-full space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={m.role === "owner" ? "primary" : "neutral"}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                {m.email === ctx.user.email && <span className="text-xs text-muted">você</span>}
              </div>
              <p className="truncate font-medium">{m.name ?? m.email}</p>
              {m.name && <p className="truncate text-sm text-muted">{m.email}</p>}
              <p className="text-xs text-muted">{ROLE_HINT[m.role]}</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
