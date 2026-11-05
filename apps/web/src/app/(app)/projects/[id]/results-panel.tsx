"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Card, ProgressBar, Spinner } from "@/components/ui";
import { formatDuration } from "@/lib/utils";
import type { JobRow, RenderRow } from "./types";

const STATUS = {
  queued: { label: "Na fila", tone: "neutral" },
  running: { label: "Gerando", tone: "warn" },
  succeeded: { label: "Pronto", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  canceled: { label: "Cancelado", tone: "neutral" },
} as const;

export function ResultsPanel({ projectId, renders, jobs }: { projectId: string; renders: RenderRow[]; jobs: JobRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (renders.length === 0) return null;

  const done = renders.filter((r) => r.status === "succeeded");
  const pending = renders.filter((r) => r.status === "queued" || r.status === "running");
  const failed = renders.filter((r) => r.status === "failed");
  const percent = (done.length / renders.length) * 100;
  const zip = jobs.filter((j) => j.kind === "zip").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const zipRunning = busy || zip?.status === "queued" || zip?.status === "running";

  async function requestZip() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/zip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = (await res.json().catch(() => ({}))) as { jobId?: string; status?: string; downloadUrl?: string | null; error?: string };
      if (!res.ok || !json.jobId) {
        setError(json.error ?? "Não foi possível montar o ZIP.");
        return;
      }
      if (json.status === "succeeded" && json.downloadUrl) {
        window.location.href = json.downloadUrl;
        router.refresh();
        return;
      }
      // Aguarda o worker terminar de compactar o ZIP e dispara o download automaticamente
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 400));
        const poll = await fetch(`/api/projects/${projectId}/zip?jobId=${encodeURIComponent(json.jobId)}`);
        const pollJson = (await poll.json().catch(() => ({}))) as { status?: string; downloadUrl?: string | null; error?: string };
        if (pollJson.status === "succeeded" && pollJson.downloadUrl) {
          window.location.href = pollJson.downloadUrl;
          router.refresh();
          return;
        }
        if (pollJson.status === "failed" || pollJson.status === "canceled") {
          setError(pollJson.error ?? "Não foi possível montar o ZIP.");
          router.refresh();
          return;
        }
      }
      router.refresh();
    } catch {
      setError("Não foi possível baixar o ZIP.");
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    setBusy(true);
    setError(null);
    try {
      const failedComboIds = failed.map((r) => r.combination_id);
      const res = await fetch(`/api/projects/${projectId}/renders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ combinationIds: failedComboIds }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Não foi possível tentar novamente.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="results-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="results-title" className="font-display text-2xl font-semibold">
            4. Seus vídeos
          </h2>
          <p className="mt-1 text-sm text-muted">
            {done.length} de {renders.length} prontos{pending.length > 0 && " — pode fechar a página, a gente continua gerando."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {zip?.status === "succeeded" && !zipRunning && (
            <a id="download-zip" href={`/api/jobs/${zip.id}/download`}>
              <Button variant="outline">Baixar ZIP ({zip.result?.count ?? done.length})</Button>
            </a>
          )}
          <Button id="make-zip" disabled={done.length === 0 || zipRunning} aria-busy={zipRunning} onClick={() => void requestZip()}>
            {zipRunning && <Spinner />} {zip?.status === "succeeded" ? "Montar ZIP de novo" : "Baixar tudo em ZIP"}
          </Button>
        </div>
      </div>

      {pending.length > 0 && <ProgressBar value={percent} />}
      {zipRunning && zip && (
        <Alert tone="primary">
          Montando o ZIP… {zip.progress}% {zip.step_label ? `· ${zip.step_label}` : ""}
        </Alert>
      )}
      {zip?.status === "failed" && <Alert>{zip.error_pt ?? "Não foi possível montar o ZIP."}</Alert>}
      {error && <Alert>{error}</Alert>}

      {failed.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/10 p-4">
          <div>
            <p className="text-sm font-medium text-warn">
              {failed.length} vídeo(s) falharam na tentativa anterior.
            </p>
            <p className="text-xs text-muted">
              O problema com o renderizador foi corrigido. Os créditos retornaram ao saldo e você pode reprocessar agora.
            </p>
          </div>
          <Button
            id="retry-failed"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void retryFailed()}
          >
            {busy ? <Spinner className="size-3" /> : null} Tentar novamente ({failed.length})
          </Button>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" id="renders-grid">
        {renders.map((r) => {
          const s = STATUS[r.status];
          return (
            <li key={r.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-medium">{r.code}</span>
                  <Badge tone={s.tone}>
                    {r.status === "running" && <Spinner className="size-3" />} {s.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted">{r.duration_ms ? `${formatDuration(r.duration_ms)} · 1080×1920` : "—"}</p>
                {r.status === "failed" && <p className="text-xs text-danger">{r.error_pt ?? "Falhou ao gerar."}</p>}
                {r.status === "succeeded" && (
                  <a href={`/api/renders/${r.id}/download`} className="mt-auto" aria-label={`Baixar vídeo ${r.code}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      Baixar MP4
                    </Button>
                  </a>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
