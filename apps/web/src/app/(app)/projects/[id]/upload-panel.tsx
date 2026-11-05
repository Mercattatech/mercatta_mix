"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Alert, Badge, Button, Card, ProgressBar, Spinner } from "@/components/ui";
import { readVideoDuration, uploadVideo } from "@/lib/upload-client";
import { TYPE_HINTS, TYPE_LABELS, TYPE_ORDER, cn, formatBytes, formatDuration, type VideoType } from "@/lib/utils";
import type { JobRow, VideoRow } from "./types";

const MAX_DURATION_MS = 3 * 60_000;
const LANGUAGES = [
  { id: "pt", label: "Português" },
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
];

interface InFlight {
  key: string;
  type: VideoType;
  name: string;
  size: number;
  progress: number;
  error?: string;
}

export function UploadPanel({ projectId, videos, jobs, canWrite }: { projectId: string; videos: VideoRow[]; jobs: JobRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [language, setLanguage] = useState("pt");
  const [inFlight, setInFlight] = useState<InFlight[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const patch = useCallback((key: string, change: Partial<InFlight>) => setInFlight((cur) => cur.map((x) => (x.key === key ? { ...x, ...change } : x))), []);

  const start = useCallback(
    async (type: VideoType, files: File[]) => {
      setNotice(null);
      for (const file of files) {
        if (!file.type.startsWith("video/") && !/\.(mp4|mov|mkv)$/i.test(file.name)) {
          setNotice(`"${file.name}" não parece ser um vídeo. Envie MP4, MOV ou MKV.`);
          continue;
        }
        const duration = await readVideoDuration(file);
        if (duration !== null && duration > MAX_DURATION_MS) {
          setNotice(`"${file.name}" tem ${formatDuration(duration)}. Cada gravação pode ter até 3 minutos — corte antes de enviar.`);
          continue;
        }
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setInFlight((cur) => [...cur, { key, type, name: file.name, size: file.size, progress: 0 }]);
        uploadVideo({ projectId, type, file, language, onProgress: (f) => patch(key, { progress: Math.min(1, f) }) })
          .then(() => {
            setInFlight((cur) => cur.filter((x) => x.key !== key));
            router.refresh();
          })
          .catch((e: Error) => {
            patch(key, { error: e.message });
            router.refresh();
          });
      }
    },
    [language, patch, projectId, router],
  );

  return (
    <section aria-labelledby="upload-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="upload-title" className="font-display text-2xl font-semibold">
            1. Envie suas gravações
          </h2>
          <p className="mt-1 text-sm text-muted">Até 3 minutos por vídeo. Quando terminar o envio, a gente transcreve palavra por palavra.</p>
        </div>
        {canWrite && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Idioma da fala
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-fg focus:border-primary/70 focus:outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {notice && <Alert tone="warn">{notice}</Alert>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TYPE_ORDER.map((type) => (
          <TypeCard
            key={type}
            type={type}
            canWrite={canWrite}
            videos={videos.filter((v) => v.type === type)}
            jobs={jobs}
            inFlight={inFlight.filter((x) => x.type === type)}
            onFiles={(files) => void start(type, files)}
            onDismiss={(key) => setInFlight((cur) => cur.filter((x) => x.key !== key))}
          />
        ))}
      </div>
    </section>
  );
}

function TypeCard({
  type,
  canWrite,
  videos,
  jobs,
  inFlight,
  onFiles,
  onDismiss,
}: {
  type: VideoType;
  canWrite: boolean;
  videos: VideoRow[];
  jobs: JobRow[];
  inFlight: InFlight[];
  onFiles: (files: File[]) => void;
  onDismiss: (key: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <Card className="flex flex-col gap-3" id={`upload-card-${type}`}>
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-medium">{TYPE_LABELS[type]}</h3>
          <Badge tone={videos.some((v) => v.status === "ready") ? "success" : "neutral"}>{videos.filter((v) => v.status === "ready").length} pronto(s)</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted">{TYPE_HINTS[type]}</p>
      </div>

      {canWrite && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            onFiles(Array.from(e.dataTransfer.files));
          }}
          className={cn("grid place-items-center rounded-xl border border-dashed px-3 py-5 text-center transition", over ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}
        >
          <input
            ref={input}
            id={`file-${type}`}
            type="file"
            accept="video/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              onFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" id={`pick-${type}`} onClick={() => input.current?.click()}>
            Escolher vídeos
          </Button>
          <p className="mt-2 text-xs text-muted">ou arraste aqui</p>
        </div>
      )}

      <ul className="space-y-2">
        {inFlight.map((u) => (
          <li key={u.key} className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate" title={u.name}>
                {u.name}
              </span>
              <span className="shrink-0 text-xs text-muted">{formatBytes(u.size)}</span>
            </div>
            {u.error ? (
              <div className="mt-1.5 flex items-start justify-between gap-2 text-xs text-danger">
                <span>{u.error}</span>
                <button type="button" className="shrink-0 underline" onClick={() => onDismiss(u.key)}>
                  fechar
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                <ProgressBar value={u.progress * 100} />
                <p className="text-xs text-muted">Enviando… {Math.round(u.progress * 100)}%</p>
              </div>
            )}
          </li>
        ))}
        {videos.map((v) => (
          <VideoItem key={v.id} video={v} job={latestJob(jobs, v.id)} canWrite={canWrite} />
        ))}
        {videos.length === 0 && inFlight.length === 0 && <li className="text-xs text-muted">Nenhum vídeo ainda.</li>}
      </ul>
    </Card>
  );
}

function latestJob(jobs: JobRow[], videoId: string): JobRow | undefined {
  return jobs.filter((j) => j.kind === "upload_process" && j.ref_id === videoId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

function VideoItem({ video, job, canWrite }: { video: VideoRow; job: JobRow | undefined; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/uploads/${video.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível tentar de novo.");
    setBusy(false);
    router.refresh();
  }

  const working = video.status === "uploaded" || video.status === "processing";
  return (
    <li className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm" data-video-id={video.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate" title={video.original_filename ?? ""}>
          {video.original_filename ?? "vídeo"}
        </span>
        {video.status === "ready" && <Badge tone="success">{formatDuration(video.duration_ms)}</Badge>}
        {working && (
          <Badge tone="warn">
            <Spinner className="size-3" /> Processando
          </Badge>
        )}
        {video.status === "uploading" && <Badge tone="neutral">Enviando</Badge>}
        {video.status === "failed" && <Badge tone="danger">Falhou</Badge>}
      </div>
      {working && (
        <div className="mt-2 space-y-1">
          <ProgressBar value={job?.progress ?? 5} />
          <p className="text-xs text-muted">{job?.step_label ?? "Na fila…"}</p>
        </div>
      )}
      {video.status === "failed" && (
        <div className="mt-1.5 space-y-1.5">
          <p className="text-xs text-danger">{video.error_pt ?? job?.error_pt ?? "Não foi possível processar este vídeo."}</p>
          {canWrite && (
            <Button type="button" size="sm" variant="outline" disabled={busy} aria-busy={busy} onClick={() => void retry()}>
              {busy && <Spinner className="size-3" />} Tentar de novo
            </Button>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </li>
  );
}
