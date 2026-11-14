import type { Metadata } from "next";
import Link from "next/link";
import { listInstagramAccounts, listSocialSchedules } from "@mercatta/server";
import { Alert, Badge, Card } from "@/components/ui";
import { getAppContext } from "@/lib/context";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Instagram — Operação e Calendário" };

const FORMAT_LABELS: Record<string, string> = {
  REELS: "Reels",
  POST: "Post (Feed)",
  CAROUSEL: "Carrossel",
};

const STATUS_BADGE: Record<
  string,
  { label: string; tone: "neutral" | "primary" | "success" | "warn" | "danger" }
> = {
  scheduled: { label: "Agendado", tone: "primary" },
  publishing: { label: "Publicando", tone: "warn" },
  published: { label: "Publicado", tone: "success" },
  failed: { label: "Falha", tone: "danger" },
  canceled: { label: "Cancelado", tone: "neutral" },
};

export default async function InstagramQueuePage() {
  const ctx = await getAppContext();
  if (!ctx.organization) {
    return (
      <Alert tone="warn">
        Sua conta ainda não está vinculada a uma organização.{" "}
        {ctx.isAdmin ? (
          <Link className="underline" href="/admin">
            Configurar organização no painel Admin.
          </Link>
        ) : null}
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
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">
            Central do Instagram
          </h1>
          <p className="mt-1 text-sm text-muted">
            Gerencie contas comerciais conectadas e acompanhe a fila de publicação de criativos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone="primary">
            <span className="font-mono">{scheduledCount}</span> na fila
          </Badge>
          <Badge tone="success">
            <span className="font-mono">{publishedCount}</span> publicados
          </Badge>
          <a
            href="/api/instagram/oauth/start?returnTo=/instagram"
            className="btn-glow inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold text-white"
          >
            + Conectar conta Instagram
          </a>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">
            Contas Conectadas ({accounts.length})
          </h2>
        </div>
        {accounts.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((acc) => (
              <li key={acc.id}>
                <Card className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-fg">{acc.name}</p>
                    <Badge tone={acc.status === "active" ? "success" : "warn"}>
                      {acc.status === "active" ? "Ativa" : acc.status}
                    </Badge>
                  </div>
                  {acc.username && (
                    <p className="font-mono text-xs text-primary-2">@{acc.username}</p>
                  )}
                  <p className="font-mono text-[11px] text-muted">ID: {acc.igUserId}</p>
                  {acc.lastError && <p className="text-xs text-warn">Nota: {acc.lastError}</p>}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="p-6 text-xs text-muted">
            Nenhuma conta conectada. Utilize o botão superior ou conecte diretamente na Etapa 5 de qualquer projeto.
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-fg">
          Histórico e Fila de Publicações ({schedules.length})
        </h2>
        {schedules.length > 0 ? (
          <Card className="divide-y divide-border p-0 overflow-hidden">
            {schedules.map((item) => {
              const st = STATUS_BADGE[item.status] ?? {
                label: item.status,
                tone: "neutral" as const,
              };
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-xs transition hover:bg-surface-2/50"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <Badge tone="neutral">{FORMAT_LABELS[item.format] ?? item.format}</Badge>
                      <span className="font-mono font-semibold text-fg">
                        {item.codes.join(" + ")}
                      </span>
                      <span className="text-muted">
                        · Projeto:{" "}
                        <Link
                          href={`/projects/${item.projectId}`}
                          className="text-fg underline-offset-2 hover:underline"
                        >
                          {item.projectName}
                        </Link>
                      </span>
                    </div>
                    {item.caption && (
                      <p className="line-clamp-1 text-muted">{item.caption}</p>
                    )}
                    {item.errorPt && <p className="text-danger">{item.errorPt}</p>}
                  </div>
                  <div className="text-right text-muted">
                    <p className="font-mono font-medium text-fg">
                      {new Date(item.scheduledAt).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="font-mono text-[11px]">{item.accountName}</p>
                    {item.permalink && (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary-2 hover:underline"
                      >
                        Ver publicação ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        ) : (
          <Card className="p-6 text-xs text-muted">
            Nenhuma publicação programada no momento.
          </Card>
        )}
      </section>
    </div>
  );
}
