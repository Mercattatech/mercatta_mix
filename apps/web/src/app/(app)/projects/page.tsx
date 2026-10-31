import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Projetos" };

const STATUS: Record<string, { label: string; tone: "neutral" | "primary" | "success" | "warn" }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  processing: { label: "Processando", tone: "warn" },
  ready: { label: "Pronto para combinar", tone: "primary" },
  rendering: { label: "Gerando vídeos", tone: "warn" },
  done: { label: "Concluído", tone: "success" },
};

export default async function ProjectsPage() {
  const ctx = await getAppContext();
  if (!ctx.organization) {
    return (
      <Alert tone="warn">
        Sua conta ainda não está vinculada a uma empresa. {ctx.isAdmin ? <Link className="underline" href="/admin">Crie uma empresa no painel Admin.</Link> : "Fale com o seu contato no Grupo Mercatta."}
      </Alert>
    );
  }
  const { rows: projects } = await getDb().query<{ id: string; name: string; status: string; created_at: Date }>(
    "select id, name, status, created_at from projects where organization_id = $1 and status <> 'archived' order by created_at desc",
    [ctx.organization.id],
  );

  return (
    <div className="animate-in space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Projetos</h1>
          <p className="mt-1 text-muted">Cada projeto reúne seus ganchos, miolos e chamadas — e as combinações que saem deles.</p>
        </div>
        {ctx.organization.role !== "aprovador" && (
          <Link href="/projects/new">
            <Button id="new-project" size="lg">+ Novo projeto</Button>
          </Link>
        )}
      </div>

      {projects.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const s = STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="group block h-full">
                  <Card className="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:border-white/20 group-hover:bg-white/[0.06]">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <h2 className="font-display mt-4 text-xl font-medium">{p.name}</h2>
                    <p className="mt-1 text-sm text-muted">Criado em {new Date(p.created_at).toLocaleDateString("pt-BR")}</p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card className="grid place-items-center gap-3 py-16 text-center">
          <p className="font-display text-2xl">Vamos criar o seu primeiro projeto</p>
          <p className="max-w-md text-muted">Envie 3 ganchos, 2 miolos e 2 chamadas e veja sair 12 vídeos prontos para postar.</p>
          {ctx.organization.role !== "aprovador" && (
            <Link href="/projects/new">
              <Button size="lg">Criar projeto</Button>
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}
