import type { Metadata } from "next";
import Link from "next/link";
import { listInstagramAccounts, listSocialSchedules } from "@mercatta/server";
import { Alert, Badge, Card } from "@/components/ui";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Instagram — Calendário e Fila" };

const FORMAT_LABELS: Record<string, string> = {
  REELS: "Reels",
  POST: "Post (Feed)",
  CAROUSEL: "Carrossel",
};

const STATUS_BADGE: Record<string, { label: string; tone: "neutral" | "primary" | "success" | "warn" | "danger" }> = {
  scheduled: { label: "Agendado", tone: "primary" },
  publishing: { label: "Publicando…", tone: "warn" },
  published: { label: "Publicado", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  canceled: { label: "Cancelado", tone: "neutral" },
};

export default async function InstagramQueuePage() {
  const ctx = await getAppContext();
  if (!ctx.organization) {
    return (
      <Alert tone="warn">
        Sua conta ainda não está vinculada a uma empresa.{" "}
        {ctx.isAdmin ? <Link className="underline" href="/admin">Crie uma empresa no painel Admin.</Link> : null}
      </Alert>
    );
  }

  const db = getDb();
  const [accounts, schedules] = await Promise.all([
    listInstagramAccounts(db, ctx.organization.id),
    listSocialSchedules(db, ctx.organization.id),
  ]);

  const scheduledCount = schedules.filter((s) => s.status === "scheduled").length;
  const publishedCount = schedules.filter((s) => s.status === "published").length;

  return (
    <div className="animate-in space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Central do Instagram</h1>
          <p className="mt-1 text-muted">
            Conecte seu Instagram com um botão e acompanhe o calendário dos seus criativos (Reels, Post e Carrossel).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="primary">{scheduledCount} na fila</Badge>
          <Badge tone="success">{publishedCount} publicado(s)</Badge>
          <a
            href="/api/instagram/oauth/start?returnTo=/instagram"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-4 font-display text-xs font-semibold text-white shadow transition hover:opacity-95"
          >
            + Conectar com o Instagram
          </a>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Contas Conectadas ({accounts.length})</h2>
        {accounts.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((acc) => (
              <li key={acc.id}>
                <Card className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display font-semibold">{acc.name}</p>
                    <Badge tone={acc.status === "active" ? "success" : "warn"}>
                      {acc.status === "active" ? "Ativa" : acc.status}
                    </Badge>
                  </div>
                  {acc.username && <p className="text-xs text-muted">@{acc.username}</p>}
                  <p className="font-mono text-xs text-muted">IG User ID: {acc.igUserId}</p>
                  {acc.lastError && <p className="text-xs text-amber-300">Aviso: {acc.lastError}</p>}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="p-6 text-sm text-muted">
            Nenhuma conta do Instagram conectada ainda. Abra qualquer projeto em{" "}
            <Link href="/projects" className="text-primary underline">
              Projetos
            </Link>{" "}
            e conecte sua conta na <strong>Etapa 5</strong>.
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Calendário de Publicações ({schedules.length})</h2>
        {schedules.length > 0 ? (
          <Card className="divide-y divide-border p-0 overflow-hidden">
            {schedules.map((item) => {
              const st = STATUS_BADGE[item.status] ?? { label: item.status, tone: "neutral" as const };
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <Badge tone="neutral">{FORMAT_LABELS[item.format] ?? item.format}</Badge>
                      <span className="font-mono text-xs font-semibold">{item.codes.join(" + ")}</span>
                      <span className="text-xs text-muted">
                        · Projeto:{" "}
                        <Link href={`/projects/${item.projectId}`} className="underline hover:text-fg">
                          {item.projectName}
                        </Link>
                      </span>
                    </div>
                    {item.caption && <p className="line-clamp-1 text-xs text-muted">{item.caption}</p>}
                    {item.errorPt && <p className="text-xs text-danger">{item.errorPt}</p>}
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p className="font-medium text-fg">
                      {new Date(item.scheduledAt).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                    <p>{item.accountName}</p>
                    {item.permalink && (
                      <a href={item.permalink} target="_blank" rel="noreferrer" className="text-primary underline">
                        Abrir no Instagram ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        ) : (
          <Card className="p-6 text-sm text-muted">
            Nenhuma publicação programada no momento. Acesse seu projeto e clique em{" "}
            <strong>Programar em Massa no Instagram</strong> na Etapa 5.
          </Card>
        )}
      </section>
    </div>
  );
}

