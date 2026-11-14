"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InstagramAccountView, InstagramFormat, SocialScheduleView } from "@mercatta/server";
import { Alert, Badge, Button, Card, Input, Spinner } from "@/components/ui";
import { formatDuration } from "@/lib/utils";
import type { RenderRow } from "./types";

const WEEKDAYS = [
  { day: 1, short: "Seg" },
  { day: 2, short: "Ter" },
  { day: 3, short: "Qua" },
  { day: 4, short: "Qui" },
  { day: 5, short: "Sex" },
  { day: 6, short: "Sáb" },
  { day: 0, short: "Dom" },
];

const FORMAT_LABELS: Record<InstagramFormat, { title: string; badge: string; desc: string }> = {
  REELS: {
    title: "Reels",
    badge: "🎬 Reels",
    desc: "Vídeo vertical 9:16 no Reels + Feed",
  },
  POST: {
    title: "Post no Feed",
    badge: "📱 Post",
    desc: "Publicação direta no Feed principal",
  },
  CAROUSEL: {
    title: "Carrossel",
    badge: "🗂️ Carrossel",
    desc: "Agrupa de 2 a 10 vídeos num único post deslizável",
  },
};

const STATUS_BADGE: Record<
  SocialScheduleView["status"],
  { label: string; tone: "neutral" | "primary" | "success" | "warn" | "danger" }
> = {
  scheduled: { label: "Agendado", tone: "primary" },
  publishing: { label: "Publicando no Instagram…", tone: "warn" },
  published: { label: "Publicado ✓", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  canceled: { label: "Cancelado", tone: "neutral" },
};

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function nowTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function toDatetimeLocalValue(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function InstagramIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-current`} aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

export function InstagramSchedulePanel({
  projectId,
  projectName,
  renders,
  initialAccounts,
  initialSchedules,
  canWrite,
}: {
  projectId: string;
  projectName: string;
  renders: RenderRow[];
  initialAccounts: InstagramAccountView[];
  initialSchedules: SocialScheduleView[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const succeededRenders = useMemo(() => renders.filter((r) => r.status === "succeeded"), [renders]);

  const defaultAccount = useMemo(
    () => initialAccounts.find((a) => a.username === "grupomercatta") ?? initialAccounts[0] ?? null,
    [initialAccounts],
  );

  const [selectedAccountId, setSelectedAccountId] = useState<string>(defaultAccount?.id ?? "");
  const [accountSearch, setAccountSearch] = useState<string>("");
  const [selectedRenderIds, setSelectedRenderIds] = useState<string[]>(() =>
    renders.filter((r) => r.status === "succeeded").map((r) => r.id),
  );
  const [previewRenderId, setPreviewRenderId] = useState<string | null>(null);

  // Formato e agendamento
  const [format, setFormat] = useState<InstagramFormat>("REELS");
  const [carouselSize, setCarouselSize] = useState<number>(3);
  const [planType, setPlanType] = useState<"bulk_slots" | "single_datetime" | "publish_now">("bulk_slots");
  const [singleDate, setSingleDate] = useState<string>(todayISO());
  const [singleTime, setSingleTime] = useState<string>("12:00");

  const [startDate, setStartDate] = useState<string>(todayISO());
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [timeSlots, setTimeSlots] = useState<string[]>(["09:00", "13:00", "19:00"]);
  const [newTimeSlot, setNewTimeSlot] = useState<string>("21:00");
  const [captionTemplate, setCaptionTemplate] = useState<string>(
    `${projectName}\n\n#reels #instagram #conteudodigital`,
  );

  // Filtros do calendário
  const [calendarStatusFilter, setCalendarStatusFilter] = useState<
    "all" | "scheduled" | "publishing" | "published" | "failed"
  >("all");
  const [calendarAccountFilter, setCalendarAccountFilter] = useState<string>("all");

  const [busySchedule, setBusySchedule] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [busyClear, setBusyClear] = useState(false);
  const [editingDateById, setEditingDateById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeAccount = useMemo(
    () => initialAccounts.find((a) => a.id === selectedAccountId) ?? defaultAccount,
    [initialAccounts, selectedAccountId, defaultAccount],
  );

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return initialAccounts;
    return initialAccounts.filter(
      (a) => (a.username?.toLowerCase().includes(q) ?? false) || a.name.toLowerCase().includes(q),
    );
  }, [initialAccounts, accountSearch]);

  // Atualiza a tela automaticamente enquanto houver algum vídeo sendo publicado ("publishing")
  const hasPublishing = useMemo(
    () => initialSchedules.some((s) => s.status === "publishing"),
    [initialSchedules],
  );
  useEffect(() => {
    if (!hasPublishing) return;
    const t = setInterval(() => {
      router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [hasPublishing, router]);

  // Mapa de agendamentos existentes por renderId (priorizando published > publishing > scheduled)
  const scheduleByRenderId = useMemo(() => {
    const map = new Map<string, SocialScheduleView>();
    const priority: Record<SocialScheduleView["status"], number> = {
      published: 4,
      publishing: 3,
      scheduled: 2,
      failed: 1,
      canceled: 0,
    };
    for (const s of initialSchedules) {
      if (s.status === "canceled") continue;
      for (const rId of s.renderIds) {
        const cur = map.get(rId);
        if (!cur || priority[s.status] >= priority[cur.status]) {
          map.set(rId, s);
        }
      }
    }
    return map;
  }, [initialSchedules]);

  const effectiveRenderIds = useMemo(() => {
    const valid = new Set(succeededRenders.map((r) => r.id));
    return selectedRenderIds.filter((id) => valid.has(id));
  }, [selectedRenderIds, succeededRenders]);

  const totalPostsToCreate = useMemo(() => {
    const n = effectiveRenderIds.length;
    if (n === 0) return 0;
    if (format !== "CAROUSEL") return n;
    const size = Math.max(2, Math.min(10, carouselSize));
    if (n <= size) return 1;
    const chunks = Math.ceil(n / size);
    const rem = n % size;
    return rem === 1 && size < 10 ? chunks - 1 : chunks;
  }, [effectiveRenderIds.length, format, carouselSize]);

  const estimatedDays = useMemo(() => {
    if (planType !== "bulk_slots" || totalPostsToCreate === 0) return 1;
    const perDay = Math.max(1, timeSlots.length);
    return Math.ceil(totalPostsToCreate / perDay);
  }, [planType, totalPostsToCreate, timeSlots.length]);

  const statusCounts = useMemo(() => {
    const counts = { all: 0, scheduled: 0, publishing: 0, published: 0, failed: 0 };
    for (const s of initialSchedules) {
      if (s.status === "canceled") continue;
      counts.all++;
      if (s.status in counts) counts[s.status as keyof typeof counts]++;
    }
    return counts;
  }, [initialSchedules]);

  const visibleSchedules = useMemo(() => {
    return initialSchedules.filter((s) => {
      if (s.status === "canceled") return false;
      if (calendarStatusFilter !== "all" && s.status !== calendarStatusFilter) return false;
      if (calendarAccountFilter !== "all" && s.instagramAccountId !== calendarAccountFilter) return false;
      return true;
    });
  }, [initialSchedules, calendarStatusFilter, calendarAccountFilter]);

  function toggleCreative(id: string) {
    setSelectedRenderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addTimeSlot() {
    const clean = newTimeSlot.trim();
    if (!/^\d{2}:\d{2}$/.test(clean)) return;
    setTimeSlots((prev) => Array.from(new Set([...prev, clean])).sort());
  }

  function removeTimeSlot(slot: string) {
    setTimeSlots((prev) => (prev.length > 1 ? prev.filter((s) => s !== slot) : prev));
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => {
      if (prev.includes(day)) return prev.length > 1 ? prev.filter((d) => d !== day) : prev;
      return [...prev, day];
    });
  }

  function connectInstagramRedirect() {
    window.location.href = `/api/instagram/oauth/start?returnTo=${encodeURIComponent(`/projects/${projectId}`)}`;
  }

  async function handleScheduleCreatives() {
    if (!activeAccount) {
      connectInstagramRedirect();
      return;
    }
    if (effectiveRenderIds.length === 0) {
      setError("Selecione pelo menos 1 criativo na grade à esquerda para programar.");
      return;
    }
    setBusySchedule(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const isNow = planType === "publish_now";
      const isSingle = planType === "single_datetime" || isNow;
      const res = await fetch(`/api/projects/${projectId}/instagram-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramAccountId: activeAccount.id,
          format,
          carouselSize: format === "CAROUSEL" ? carouselSize : undefined,
          renderIds: effectiveRenderIds,
          startDate: isNow ? todayISO() : isSingle ? singleDate : startDate,
          daysOfWeek: isSingle ? [0, 1, 2, 3, 4, 5, 6] : daysOfWeek,
          scheduleMode: "fixed_times",
          timesOfDay: isNow ? [nowTimeHHMM()] : isSingle ? [singleTime] : timeSlots,
          timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
          captionTemplate,
          shareToFeed: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        count?: number;
        schedules?: SocialScheduleView[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível agendar os criativos.");
        return;
      }

      if (isNow && data.schedules && data.schedules.length > 0) {
        // Dispara publicação imediata no primeiro lote
        for (const sched of data.schedules.slice(0, 3)) {
          await fetch(`/api/projects/${projectId}/instagram-schedules`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduleId: sched.id, action: "publish_now" }),
          });
        }
        setSuccessMsg(
          `Enviando agora para @${activeAccount.username || activeAccount.name}! Acompanhe o status "Publicando no Instagram…" abaixo.`,
        );
      } else {
        setSuccessMsg(
          `${data.count ?? totalPostsToCreate} publicação(ões) de ${FORMAT_LABELS[format].title} programada(s) em @${activeAccount.username || activeAccount.name}!`,
        );
      }
      router.refresh();
    } catch {
      setError("Sem conexão ao programar os criativos.");
    } finally {
      setBusySchedule(false);
    }
  }

  async function handleScheduleAction(
    scheduleId: string,
    payload: { action?: "cancel" | "publish_now"; scheduledAt?: string },
  ) {
    setActionBusyId(scheduleId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/instagram-schedules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId, ...payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível atualizar o agendamento.");
        return;
      }
      if (payload.action === "publish_now") {
        setSuccessMsg("Vídeo enviado para a fila imediata do Instagram! Ele mudará para 'Publicado ✓' em ~15 segundos.");
      }
      router.refresh();
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleClearSchedules(mode: "failed_or_canceled" | "all_pending") {
    setBusyClear(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/instagram-schedules`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) {
        setSuccessMsg(
          mode === "all_pending"
            ? "Fila de agendamentos pendentes limpa com sucesso."
            : "Registros com falha/cancelados removidos.",
        );
        router.refresh();
      }
    } finally {
      setBusyClear(false);
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="step-instagram">
      {/* Cabeçalho + Resumo de Como Funciona */}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-white">
                <InstagramIcon className="h-4 w-4" />
              </span>
              <h2 id="step-instagram" className="font-display text-2xl font-semibold">
                5. Publicar e Agendar no Instagram
              </h2>
            </div>
            <p className="text-sm text-muted">
              Publique seus vídeos prontos diretamente como <strong>Reels</strong>, <strong>Post</strong> ou <strong>Carrossel</strong> nos seus perfis oficiais conectados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {initialAccounts.length > 0 && (
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {initialAccounts.length} perfis do Instagram conectados
              </span>
            )}
            <button
              id="connect-instagram-btn"
              type="button"
              onClick={connectInstagramRedirect}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-xs font-semibold text-fg transition hover:bg-surface"
            >
              <InstagramIcon className="h-4 w-4" />
              {initialAccounts.length > 0 ? "Reconectar / + Contas Meta" : "Conectar com o Instagram"}
            </button>
          </div>
        </div>

        {/* Guia Visual Rápido de 4 Passos */}
        <div className="grid gap-2.5 pt-1 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface-2/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Passo 1 · Perfil</p>
            <p className="mt-0.5 text-xs text-fg">
              Escolha em qual conta (ex.: <strong>@{activeAccount?.username || "grupomercatta"}</strong>) você quer postar.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Passo 2 · Criativos</p>
            <p className="mt-0.5 text-xs text-fg">
              Marque na grade à esquerda os vídeos que deseja publicar (1 vídeo ou o lote inteiro).
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Passo 3 · Quando Postar</p>
            <p className="mt-0.5 text-xs text-fg">
              Escolha <strong>Grade Automática</strong> (ex.: 3x ao dia), <strong>Horário Único</strong> ou <strong>Publicar Agora</strong>.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Passo 4 · Acompanhar</p>
            <p className="mt-0.5 text-xs text-fg">
              No calendário abaixo, veja o status ao vivo e clique em <strong>Ver no Instagram ↗</strong>.
            </p>
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {successMsg && <Alert tone="success">{successMsg}</Alert>}

      {/* Estúdio Visual de Criativos + Programação */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Coluna Esquerda (7 cols): Grade Visual de Criativos */}
        <Card className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <h3 className="font-display text-base font-semibold">
                Seus Criativos Prontos ({effectiveRenderIds.length} de {succeededRenders.length} selecionados)
              </h3>
              <p className="text-xs text-muted">
                Clique em qualquer criativo para marcar/desmarcar ou clique em <strong>▶ Assistir</strong> para visualizar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedRenderIds(succeededRenders.map((r) => r.id))}
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-surface"
              >
                Todos ({succeededRenders.length})
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedRenderIds(
                    succeededRenders.filter((r) => !scheduleByRenderId.has(r.id)).map((r) => r.id),
                  )
                }
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-surface"
              >
                Só não agendados
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedRenderIds(succeededRenders[0] ? [succeededRenders[0].id] : [])
                }
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-surface"
              >
                Apenas 1º vídeo
              </button>
              <button
                type="button"
                onClick={() => setSelectedRenderIds([])}
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-fg"
              >
                Limpar
              </button>
            </div>
          </div>

          {previewRenderId && (
            <div className="rounded-xl border border-primary/40 bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">
                  Pré-visualização do criativo{" "}
                  {succeededRenders.find((r) => r.id === previewRenderId)?.code}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewRenderId(null)}
                  className="text-xs text-muted hover:text-fg"
                >
                  Fechar ✕
                </button>
              </div>
              <video
                key={previewRenderId}
                src={`/api/renders/${previewRenderId}/download`}
                controls
                autoPlay
                className="mx-auto max-h-80 rounded-lg bg-black"
              />
            </div>
          )}

          {succeededRenders.length > 0 ? (
            <div className="grid max-h-[32rem] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
              {succeededRenders.map((r, idx) => {
                const isSelected = effectiveRenderIds.includes(r.id);
                const existingSched = scheduleByRenderId.get(r.id);
                return (
                  <div
                    key={r.id}
                    onClick={() => toggleCreative(r.id)}
                    className={`cursor-pointer rounded-xl border p-3 transition ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-surface-2/40 opacity-75 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="font-mono text-xs font-semibold">{r.code}</span>
                      </div>
                      <span className="text-[11px] text-muted">#{idx + 1}</span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-xs text-muted">
                      <span>{formatDuration(r.duration_ms)}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewRenderId(r.id);
                        }}
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        ▶ Assistir
                      </button>
                    </div>

                    {existingSched?.status === "published" ? (
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-300">
                        <span>✓ Publicado</span>
                        {existingSched.permalink && (
                          <a
                            href={existingSched.permalink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="underline hover:text-white"
                          >
                            Abrir ↗
                          </a>
                        )}
                      </div>
                    ) : existingSched ? (
                      <div className="mt-2 rounded-lg bg-primary/15 px-2 py-1 text-[11px] font-medium text-fg">
                        📅{" "}
                        {new Date(existingSched.scheduledAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-muted">Disponível para agendar</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted">
              Gere seus vídeos na Etapa 3 para que seus criativos apareçam aqui prontos para agendar.
            </div>
          )}
        </Card>

        {/* Coluna Direita (5 cols): Configuração Passo a Passo */}
        <Card className="space-y-5 lg:col-span-5">
          <div>
            <h3 className="font-display text-base font-semibold">Configurar Publicação</h3>
            <p className="text-xs text-muted">
              Defina o perfil de destino, o formato e quando os {effectiveRenderIds.length} criativos selecionados serão postados.
            </p>
          </div>

          {/* 1. Perfil do Instagram */}
          <div className="space-y-2 rounded-xl border border-border bg-surface-2/40 p-3">
            <label className="text-xs font-semibold text-fg uppercase tracking-wider">
              1. Perfil do Instagram de Destino
            </label>
            {initialAccounts.length > 5 && (
              <Input
                type="search"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Buscar conta (ex.: grupomercatta, m4, voesoftware)..."
                className="h-8 text-xs"
              />
            )}
            <select
              value={activeAccount?.id ?? ""}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium text-fg"
            >
              {filteredAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.username ? `@${acc.username}` : acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Formato: Reels, Post ou Carrossel */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-fg uppercase tracking-wider">2. Formato no Instagram</label>
            <div className="grid grid-cols-3 gap-2">
              {(["REELS", "POST", "CAROUSEL"] as const).map((fmt) => {
                const active = format === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      active
                        ? "border-primary bg-primary/15 ring-1 ring-primary"
                        : "border-border bg-surface-2/40 hover:bg-surface-2"
                    }`}
                  >
                    <p className="font-display text-xs font-semibold">{FORMAT_LABELS[fmt].badge}</p>
                    <p className="mt-0.5 text-[10px] leading-tight text-muted">{FORMAT_LABELS[fmt].desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {format === "CAROUSEL" && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Vídeos por Carrossel:</span>
                <div className="flex gap-1">
                  {[2, 3, 4, 5, 6, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCarouselSize(n)}
                      className={`h-7 w-7 rounded-md border text-xs font-semibold ${
                        carouselSize === n
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-surface"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. Quando Publicar */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-fg uppercase tracking-wider">3. Quando Publicar</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setPlanType("bulk_slots")}
                className={`rounded-xl border p-2 text-xs font-medium transition ${
                  planType === "bulk_slots"
                    ? "border-primary bg-primary/15 text-fg ring-1 ring-primary"
                    : "border-border bg-surface-2/40 text-muted"
                }`}
              >
                📅 Grade de Horários
              </button>
              <button
                type="button"
                onClick={() => setPlanType("single_datetime")}
                className={`rounded-xl border p-2 text-xs font-medium transition ${
                  planType === "single_datetime"
                    ? "border-primary bg-primary/15 text-fg ring-1 ring-primary"
                    : "border-border bg-surface-2/40 text-muted"
                }`}
              >
                ⏰ Data / Hora Fixa
              </button>
              <button
                type="button"
                onClick={() => setPlanType("publish_now")}
                className={`rounded-xl border p-2 text-xs font-medium transition ${
                  planType === "publish_now"
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500"
                    : "border-border bg-surface-2/40 text-muted"
                }`}
              >
                🚀 Publicar Agora
              </button>
            </div>

            {planType === "bulk_slots" ? (
              <div className="space-y-3 rounded-xl border border-border bg-surface-2/30 p-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted">Data de início</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted">Dias da semana permitidos</label>
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.map((w) => {
                      const on = daysOfWeek.includes(w.day);
                      return (
                        <button
                          key={w.day}
                          type="button"
                          onClick={() => toggleDay(w.day)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                            on
                              ? "border-primary bg-primary text-white"
                              : "border-border bg-surface text-muted"
                          }`}
                        >
                          {w.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted">Horários do dia ({timeSlots.length} postagens/dia)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {timeSlots.map((slot) => (
                      <span
                        key={slot}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold"
                      >
                        {slot}
                        <button
                          type="button"
                          onClick={() => removeTimeSlot(slot)}
                          className="text-muted hover:text-fg"
                          title="Remover horário"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="time"
                      value={newTimeSlot}
                      onChange={(e) => setNewTimeSlot(e.target.value)}
                      className="h-9"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addTimeSlot}>
                      + Adicionar horário
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-fg">
                  💡 <strong>Resumo da grade:</strong> {totalPostsToCreate} {FORMAT_LABELS[format].title} distribuídos em{" "}
                  <strong>{timeSlots.length} horário(s)/dia</strong> (~{estimatedDays} dia(s) de conteúdo no ar).
                </div>
              </div>
            ) : planType === "single_datetime" ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-2/30 p-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted">Dia</label>
                  <Input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">Hora</label>
                  <Input type="time" value={singleTime} onChange={(e) => setSingleTime(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                🚀 <strong>Publicação imediata:</strong> O(s) criativo(s) selecionado(s) serão enviados agora mesmo diretamente para{" "}
                <strong>@{activeAccount?.username || activeAccount?.name}</strong>.
              </div>
            )}
          </div>

          {/* 4. Legenda */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-fg uppercase tracking-wider">4. Legenda do Post / Reel</label>
            <textarea
              rows={3}
              value={captionTemplate}
              onChange={(e) => setCaptionTemplate(e.target.value)}
              placeholder="Escreva a legenda e as hashtags dos seus criativos..."
              className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-fg placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>

          {/* 5. Botão Principal de Agendar / Publicar */}
          {canWrite && (
            <button
              id="schedule-bulk-instagram"
              type="button"
              disabled={busySchedule || effectiveRenderIds.length === 0}
              onClick={handleScheduleCreatives}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-5 font-display text-sm font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
            >
              {busySchedule ? <Spinner /> : <InstagramIcon className="h-5 w-5" />}
              {activeAccount
                ? planType === "publish_now"
                  ? `Publicar Agora (${totalPostsToCreate}) em @${activeAccount.username || activeAccount.name}`
                  : `Programar ${totalPostsToCreate} ${FORMAT_LABELS[format].title} em @${activeAccount.username || activeAccount.name}`
                : "Conectar Instagram e Programar Criativos"}
            </button>
          )}
        </Card>
      </div>

      {/* Lista de Criativos Agendados e Publicados */}
      {statusCounts.all > 0 && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="font-display text-lg font-semibold">
                Fila e Calendário de Publicações ({visibleSchedules.length})
              </h3>
              <p className="text-xs text-muted">
                Clique em <strong>Publicar agora</strong> em qualquer vídeo para postar imediatamente ou altere a data/hora.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {statusCounts.failed > 0 && canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyClear}
                  onClick={() => handleClearSchedules("failed_or_canceled")}
                >
                  Limpar falhas ({statusCounts.failed})
                </Button>
              )}
              {statusCounts.scheduled > 0 && canWrite && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyClear}
                  onClick={() => handleClearSchedules("all_pending")}
                >
                  Limpar fila agendada
                </Button>
              )}
            </div>
          </div>

          {/* Filtros de Status e Conta */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "all", label: `Todos (${statusCounts.all})` },
                  { id: "published", label: `Publicados ✓ (${statusCounts.published})` },
                  { id: "publishing", label: `Publicando (${statusCounts.publishing})` },
                  { id: "scheduled", label: `Agendados (${statusCounts.scheduled})` },
                  ...(statusCounts.failed > 0 ? [{ id: "failed", label: `Com erro (${statusCounts.failed})` }] : []),
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCalendarStatusFilter(tab.id as typeof calendarStatusFilter)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    calendarStatusFilter === tab.id
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface-2/50 text-muted hover:text-fg"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              value={calendarAccountFilter}
              onChange={(e) => setCalendarAccountFilter(e.target.value)}
              className="h-8 rounded-lg border border-border bg-surface px-2.5 text-xs text-fg"
            >
              <option value="all">Todas as contas</option>
              {initialAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  @{acc.username || acc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[30rem] overflow-y-auto pr-1">
            <ul className="divide-y divide-border">
              {visibleSchedules.map((item) => {
                const st = STATUS_BADGE[item.status] ?? { label: item.status, tone: "neutral" as const };
                const localVal = editingDateById[item.id] ?? toDatetimeLocalValue(item.scheduledAt);
                const busy = actionBusyId === item.id || item.status === "publishing";
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-[14rem] flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <Badge tone="neutral">{FORMAT_LABELS[item.format]?.badge ?? item.format}</Badge>
                        <span className="font-mono text-xs font-semibold">{item.codes.join(" + ")}</span>
                        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg">
                          @{item.accountUsername || item.accountName}
                        </span>
                      </div>
                      {item.caption && <p className="line-clamp-1 text-xs text-muted">{item.caption}</p>}
                      {item.errorPt && <p className="text-xs text-danger">{item.errorPt}</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.status === "published" && item.permalink && (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                        >
                          Ver no Instagram ↗
                        </a>
                      )}
                      <input
                        type="datetime-local"
                        value={localVal}
                        disabled={!canWrite || item.status === "published" || busy}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditingDateById((prev) => ({ ...prev, [item.id]: v }));
                        }}
                        onBlur={() => {
                          const v = editingDateById[item.id];
                          if (v) {
                            void handleScheduleAction(item.id, { scheduledAt: new Date(v).toISOString() });
                          }
                        }}
                        className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs text-fg"
                      />
                      {canWrite && item.status !== "published" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => handleScheduleAction(item.id, { action: "publish_now" })}
                          >
                            {item.status === "publishing" ? "Publicando…" : "Publicar agora"}
                          </Button>
                          {item.status !== "canceled" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => handleScheduleAction(item.id, { action: "cancel" })}
                            >
                              Cancelar
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      )}
    </section>
  );
}
