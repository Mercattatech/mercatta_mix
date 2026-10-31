"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { TYPE_LABELS, TYPE_ORDER, cn, formatDuration } from "@/lib/utils";
import type { SegmentRow, VideoRow, Word } from "./types";

/**
 * Editor de trechos: o texto da transcrição vira "palavras clicáveis". O primeiro clique marca o começo,
 * o segundo marca o fim — o corte acontece no limite exato das palavras escolhidas.
 */
export function SegmentEditor({
  projectId,
  videos,
  words,
  segments,
  canWrite,
}: {
  projectId: string;
  videos: VideoRow[];
  words: Record<string, Word[]>;
  segments: SegmentRow[];
  canWrite: boolean;
}) {
  const ready = videos.filter((v) => v.status === "ready" && (words[v.id]?.length ?? 0) > 0);
  const [activeId, setActiveId] = useState<string | null>(ready[0]?.id ?? null);
  const active = ready.find((v) => v.id === activeId) ?? ready[0] ?? null;

  return (
    <section aria-labelledby="edit-title" className="space-y-4">
      <div>
        <h2 id="edit-title" className="font-display text-2xl font-semibold">
          2. Escolha os trechos
        </h2>
        <p className="mt-1 text-sm text-muted">Selecione no texto o pedaço de cada gravação que vai entrar nos vídeos. Dá para ter vários trechos por gravação.</p>
      </div>

      {ready.length === 0 ? (
        <Card className="text-sm text-muted">Assim que um vídeo terminar de ser processado, a transcrição dele aparece aqui.</Card>
      ) : (
        <Card className="space-y-4">
          <div role="tablist" aria-label="Gravações" className="flex flex-wrap gap-2">
            {TYPE_ORDER.flatMap((t) => ready.filter((v) => v.type === t)).map((v, i) => {
              const count = segments.filter((s) => s.source_video_id === v.id).length;
              const on = v.id === active?.id;
              return (
                <button
                  key={v.id}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  id={`tab-${v.id}`}
                  onClick={() => setActiveId(v.id)}
                  className={cn("rounded-full border px-3.5 py-1.5 text-sm transition", on ? "border-primary/70 bg-primary/20 text-fg" : "border-white/10 text-muted hover:border-white/25 hover:text-fg")}
                >
                  {TYPE_LABELS[v.type]} {i + 1}
                  {count > 0 && <span className="ml-1.5 text-xs text-accent">· {count} trecho(s)</span>}
                </button>
              );
            })}
          </div>
          {active && <VideoEditor key={active.id} projectId={projectId} video={active} words={words[active.id]!} segments={segments.filter((s) => s.source_video_id === active.id)} canWrite={canWrite} />}
        </Card>
      )}
    </section>
  );
}

function VideoEditor({ projectId, video, words, segments, canWrite }: { projectId: string; video: VideoRow; words: Word[]; segments: SegmentRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [anchor, setAnchor] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = useMemo(() => {
    const set = new Set<number>();
    for (const s of segments) for (let i = s.start_word_idx; i <= s.end_word_idx; i++) set.add(i);
    return set;
  }, [segments]);

  function pick(i: number) {
    if (!canWrite) return;
    if (anchor === null) {
      setAnchor(i);
      setRange([i, i]);
    } else {
      setRange([Math.min(anchor, i), Math.max(anchor, i)]);
      setAnchor(null);
    }
  }

  async function save(start: number, end: number, name?: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/segments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceVideoId: video.id, startWordIdx: start, endWordIdx: end, ...(name?.trim() ? { label: name.trim() } : {}) }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Não foi possível salvar o trecho.");
      return;
    }
    setRange(null);
    setAnchor(null);
    setLabel("");
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/segments/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível apagar o trecho.");
    router.refresh();
  }

  const selMs = range ? { start: words[range[0]]!.start_ms, end: words[range[1]]!.end_ms } : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          <Badge tone="primary">{TYPE_LABELS[video.type]}</Badge> <span className="ml-1">{video.original_filename}</span> · {formatDuration(video.duration_ms)}
        </p>
        {canWrite && (
          <Button type="button" variant="outline" size="sm" id={`whole-${video.id}`} disabled={busy} onClick={() => void save(0, words.length - 1, "Vídeo inteiro")}>
            Usar o vídeo inteiro
          </Button>
        )}
      </div>

      <p className="max-h-72 overflow-y-auto rounded-xl bg-black/20 p-4 leading-8" aria-label="Transcrição" id={`transcript-${video.id}`}>
        {words.map((w, i) => (
          <button
            key={i}
            type="button"
            disabled={!canWrite}
            onClick={() => pick(i)}
            data-in-range={range ? i >= range[0] && i <= range[1] : false}
            data-used={used.has(i)}
            title={`${(w.start_ms / 1000).toFixed(2)}s`}
            className="word-chip"
          >
            {w.w}
          </button>
        ))}
      </p>

      {canWrite && range && selMs && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
          <p className="text-sm">
            Selecionado: <strong>{range[1] - range[0] + 1} palavras</strong> · {formatDuration(selMs.end - selMs.start)}
            {anchor !== null && <span className="text-muted"> — clique na última palavra</span>}
          </p>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="Nome (opcional)"
            aria-label="Nome do trecho"
            className="h-9 min-w-40 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm focus:border-primary/70 focus:outline-none"
          />
          <Button type="button" size="sm" id="save-segment" disabled={busy || anchor !== null} aria-busy={busy} onClick={() => void save(range[0], range[1], label)}>
            {busy && <Spinner className="size-3" />} Salvar trecho
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setRange(null);
              setAnchor(null);
            }}
          >
            Limpar
          </Button>
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      {segments.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Trechos salvos">
          {segments.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{s.label || words.slice(s.start_word_idx, s.start_word_idx + 6).map((w) => w.w).join(" ") + "…"}</span>
                <span className="text-xs text-muted">{formatDuration(s.end_ms - s.start_ms)}</span>
              </span>
              {canWrite && (
                <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => void remove(s.id)} aria-label="Apagar trecho">
                  Apagar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
