"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InstagramAccountView, InstagramFormat, SocialScheduleView } from "@mercatta/server";
import { Alert, Badge, Button, Card, Input, Spinner } from "@/components/ui";
import type { RenderRow } from "./types";

const WEEKDAYS = [
  { day: 1, short: "Seg", full: "Segunda" },
  { day: 2, short: "Ter", full: "Terça" },
  { day: 3, short: "Qua", full: "Quarta" },
  { day: 4, short: "Qui", full: "Quinta" },
  { day: 5, short: "Sex", full: "Sexta" },
  { day: 6, short: "Sáb", full: "Sábado" },
  { day: 0, short: "Dom", full: "Domingo" },
];

const FORMAT_LABELS: Record<InstagramFormat, { title: string; subtitle: string }> = {
  REELS: {
    title: "Reels",
    subtitle: "1 vídeo 9:16 por publicação no Reels (+ opção de exibir no Feed)",
  },
  POST: {
    title: "Post (Feed)",
    subtitle: "1 vídeo por publicação direta na grade principal do perfil",
  },
  CAROUSEL: {
    title: "Carrossel em Lote",
    subtitle: "Agrupa de 2 a 10 vídeos gerados em cada publicação deslizável",
  },
};

const STATUS_BADGE: Record<
  SocialScheduleView["status"],
  { label: string; tone: "neutral" | "primary" | "success" | "warn" | "danger" }
> = {
  scheduled: { label: "Agendado", tone: "primary" },
  publishing: { label: "Publicando…", tone: "warn" },
  published: { label: "Publicado", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  canceled: { label: "Cancelado", tone: "neutral" },
};

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDatetimeLocalValue(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
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

  const [accounts, setAccounts] = useState<InstagramAccountView[]>(initialAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccounts[0]?.id ?? "");
  const [showAddAccount, setShowAddAccount] = useState(initialAccounts.length === 0);

  // Formulário de nova conta Instagram Graph API
  const [accName, setAccName] = useState("");
  const [accUsername, setAccUsername] = useState("");
  const [accIgUserId, setAccIgUserId] = useState("");
  const [accToken, setAccToken] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  // Configuração da programação em massa
  const [format, setFormat] = useState<InstagramFormat>("REELS");
  const [carouselSize, setCarouselSize] = useState<number>(3);
  const [shareToFeed, setShareToFeed] = useState<boolean>(true);
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [scheduleMode, setScheduleMode] = useState<"fixed_times" | "interval">("fixed_times");
  const [timesInput, setTimesInput] = useState<string>("09:00, 13:00, 19:00");
  const [intervalMinutes, setIntervalMinutes] = useState<number>(180);
  const [windowStart, setWindowStart] = useState<string>("08:00");
  const [windowEnd, setWindowEnd] = useState<string>("21:00");
  const [captionTemplate, setCaptionTemplate] = useState<string>(
    `${projectName} — Variação {codigo} ({indice}/{total})\n\n#reels #instagram #conteudodigital`,
  );

  const [busySchedule, setBusySchedule] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [editingDateById, setEditingDateById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const parsedTimes = useMemo(
    () =>
      timesInput
        .split(/[,\s;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{1,2}:\d{2}$/.test(s)),
    [timesInput],
  );

  const slotsPerDay = useMemo(() => {
    if (scheduleMode === "fixed_times") return Math.max(1, parsedTimes.length);
    const parseMin = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const diff = Math.max(0, parseMin(windowEnd) - parseMin(windowStart));
    return Math.max(1, Math.floor(diff / Math.max(15, intervalMinutes)) + 1);
  }, [scheduleMode, parsedTimes.length, windowStart, windowEnd, intervalMinutes]);

  const totalPostsToCreate = useMemo(() => {
    if (succeededRenders.length === 0) return 0;
    if (format !== "CAROUSEL") return succeededRenders.length;
    const size = Math.max(2, Math.min(10, carouselSize));
    if (succeededRenders.length <= size) return 1;
    const chunks = Math.ceil(succeededRenders.length / size);
    const remainder = succeededRenders.length % size;
    return remainder === 1 && size < 10 ? chunks - 1 : chunks;
  }, [succeededRenders.length, format, carouselSize]);

  const estimatedDays = useMemo(() => {
    if (totalPostsToCreate === 0) return 0;
    return Math.ceil(totalPostsToCreate / slotsPerDay);
  }, [totalPostsToCreate, slotsPerDay]);

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => {
      if (prev.includes(day)) {
        return prev.length > 1 ? prev.filter((d) => d !== day) : prev;
      }
      return [...prev, day];
    });
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    setSavingAccount(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/instagram/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: accName.trim() || accUsername.trim() || "Instagram Principal",
          username: accUsername.trim().replace(/^@/, "") || null,
          igUserId: accIgUserId.trim(),
          accessToken: accToken.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { account?: InstagramAccountView; error?: string };
      if (!res.ok || !data.account) {
        setError(data.error ?? "Não foi possível salvar a conta do Instagram.");
        return;
      }
      setAccounts((prev) => {
        const filtered = prev.filter((a) => a.id !== data.account!.id);
        return [...filtered, data.account!];
      });
      setSelectedAccountId(data.account.id);
      setShowAddAccount(false);
      setAccName("");
      setAccUsername("");
      setAccIgUserId("");
      setAccToken("");
      setSuccessMsg(`Conta ${data.account.name} conectada com sucesso!`);
      router.refresh();
    } catch {
      setError("Sem conexão ao salvar a conta do Instagram.");
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleBulkSchedule() {
    if (!selectedAccountId) {
      setError("Conecte ou selecione uma conta do Instagram antes de agendar.");
      setShowAddAccount(true);
      return;
    }
    if (succeededRenders.length === 0) {
      setError("Aguarde pelo menos 1 vídeo ficar pronto na Etapa 4 antes de programar no Instagram.");
      return;
    }
    setBusySchedule(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/instagram-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramAccountId: selectedAccountId,
          format,
          carouselSize: format === "CAROUSEL" ? carouselSize : undefined,
          startDate,
          daysOfWeek,
          scheduleMode,
          timesOfDay: scheduleMode === "fixed_times" ? parsedTimes : undefined,
          intervalMinutes: scheduleMode === "interval" ? intervalMinutes : undefined,
          windowStart: scheduleMode === "interval" ? windowStart : undefined,
          windowEnd: scheduleMode === "interval" ? windowEnd : undefined,
          timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
          captionTemplate,
          shareToFeed,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { count?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar a programação em massa.");
        return;
      }
      setSuccessMsg(
        `${data.count ?? totalPostsToCreate} publicações (${FORMAT_LABELS[format].title}) programadas na fila do Instagram!`,
      );
      router.refresh();
    } catch {
      setError("Sem conexão ao programar lote no Instagram.");
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
      router.refresh();
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="step-instagram">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="step-instagram" className="font-display text-2xl font-semibold">
            5. Programar em Massa no Instagram (Reels, Post e Carrossel)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Distribua os vídeos gerados automaticamente por data, dias da semana, horários fixos ou intervalo de horas via API Oficial da Meta.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAddAccount((v) => !v)}>
          {showAddAccount ? "Fechar configuração de conta" : "+ Conectar / Trocar Conta Instagram"}
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}
      {successMsg && <Alert tone="success">{successMsg}</Alert>}

      {showAddAccount && canWrite && (
        <Card className="space-y-4 border-primary/40 bg-surface-2/60">
          <div>
            <h3 className="font-display text-lg font-medium">Conectar Conta Profissional do Instagram (Meta Graph API)</h3>
            <p className="text-xs text-muted">
              Informe o <strong>IG User ID</strong> (ID da conta comercial do Instagram vinculada à Página do Facebook) e o <strong>Access Token</strong> de longa duração do seu App na Meta.
            </p>
          </div>
          <form onSubmit={handleSaveAccount} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted">Nome de identificação</label>
              <Input
                placeholder="Ex.: Instagram Mercatta Oficial"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">@usuario (opcional)</label>
              <Input
                placeholder="Ex.: @mercatta.oficial"
                value={accUsername}
                onChange={(e) => setAccUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">Instagram Business Account ID (IG User ID)</label>
              <Input
                placeholder="Ex.: 17841405822304914"
                value={accIgUserId}
                onChange={(e) => setAccIgUserId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">Meta Graph API Access Token</label>
              <Input
                type="password"
                placeholder="EAABsbCS1iHgBO..."
                value={accToken}
                onChange={(e) => setAccToken(e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-1">
              <Button type="submit" disabled={savingAccount}>
                {savingAccount ? <Spinner /> : null} Salvar e Validar Conta Instagram
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="space-y-6">
        {/* 1. Seleção da conta e do formato */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted uppercase tracking-wider">Conta de destino no Instagram</label>
            {accounts.length > 0 ? (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-fg focus:border-primary focus:outline-none"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} {acc.username ? `(@${acc.username})` : ""} — ID: {acc.igUserId}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
                Nenhuma conta conectada ainda. Preencha o quadro acima para conectar seu Instagram Business.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted uppercase tracking-wider">Formato da Publicação</label>
            <div className="grid grid-cols-3 gap-2">
              {(["REELS", "POST", "CAROUSEL"] as const).map((fmt) => {
                const active = format === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-surface-2/40 hover:border-border/80"
                    }`}
                  >
                    <p className="font-display text-sm font-semibold">{FORMAT_LABELS[fmt].title}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-muted">{FORMAT_LABELS[fmt].subtitle}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Opções específicas de Reels ou Carrossel */}
        {format === "REELS" && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/30 px-4 py-3">
            <input
              id="share-to-feed"
              type="checkbox"
              checked={shareToFeed}
              onChange={(e) => setShareToFeed(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <label htmlFor="share-to-feed" className="text-sm">
              Compartilhar Reels também na grade principal do Feed do perfil
            </label>
          </div>
        )}

        {format === "CAROUSEL" && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Quantidade de vídeos por Carrossel</p>
              <p className="text-xs text-muted">
                O sistema agrupa os vídeos gerados em sequência (2 a 10 vídeos por post de carrossel).
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCarouselSize(n)}
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold transition ${
                    carouselSize === n
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface hover:bg-surface-2"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. Configuração de Tempo, Hora e Dia */}
        <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted uppercase tracking-wider">Data de início</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted uppercase tracking-wider">Dias da semana permitidos</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w) => {
                const selected = daysOfWeek.includes(w.day);
                return (
                  <button
                    key={w.day}
                    type="button"
                    onClick={() => toggleDay(w.day)}
                    title={w.full}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      selected
                        ? "border-primary bg-primary/15 text-fg ring-1 ring-primary/50"
                        : "border-border bg-surface text-muted hover:text-fg"
                    }`}
                  >
                    {w.short}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted uppercase tracking-wider">Regra de Horários por Dia</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScheduleMode("fixed_times")}
                className={`rounded-xl border p-3 text-left text-xs transition ${
                  scheduleMode === "fixed_times"
                    ? "border-primary bg-primary/10 font-medium text-fg"
                    : "border-border bg-surface text-muted"
                }`}
              >
                Horários fixos no dia
                <span className="block text-[11px] text-muted">Ex.: 09:00, 13:00, 19:00</span>
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode("interval")}
                className={`rounded-xl border p-3 text-left text-xs transition ${
                  scheduleMode === "interval"
                    ? "border-primary bg-primary/10 font-medium text-fg"
                    : "border-border bg-surface text-muted"
                }`}
              >
                Intervalo em horas/minutos
                <span className="block text-[11px] text-muted">Ex.: a cada 3 horas</span>
              </button>
            </div>
          </div>

          {scheduleMode === "fixed_times" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted uppercase tracking-wider">
                Horários do dia (separados por vírgula)
              </label>
              <Input
                value={timesInput}
                onChange={(e) => setTimesInput(e.target.value)}
                placeholder="09:00, 13:00, 19:00"
              />
              <p className="text-[11px] text-muted">
                {parsedTimes.length} horário(s) por dia: {parsedTimes.join(" • ") || "nenhum válido"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted">A cada (min)</label>
                <select
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-2.5 text-sm text-fg"
                >
                  <option value={30}>30 min</option>
                  <option value={60}>1 hora</option>
                  <option value={120}>2 horas</option>
                  <option value={180}>3 horas</option>
                  <option value={240}>4 horas</option>
                  <option value={360}>6 horas</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">Das</label>
                <Input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">Até</label>
                <Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* 3. Legenda (Caption) da publicação */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted uppercase tracking-wider">
              Legenda da publicação no Instagram (Caption + Hashtags)
            </label>
            <span className="text-[11px] text-muted">
              Variáveis: <code>{"{projeto}"}</code>, <code>{"{codigo}"}</code>, <code>{"{indice}"}</code>, <code>{"{total}"}</code>
            </span>
          </div>
          <textarea
            rows={3}
            value={captionTemplate}
            onChange={(e) => setCaptionTemplate(e.target.value)}
            placeholder="Escreva a legenda e as hashtags que irão na descrição do Reel/Post/Carrossel..."
            className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-fg placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>

        {/* 4. Resumo e botão de disparo em massa */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface-2 p-4">
          <div className="space-y-1">
            <p className="font-display text-base font-semibold">
              {succeededRenders.length} vídeo(s) prontos →{" "}
              <span className="text-primary">
                {totalPostsToCreate} publicação(ões) de {FORMAT_LABELS[format].title}
              </span>
            </p>
            <p className="text-xs text-muted">
              Ritmo: {slotsPerDay} publicação(ões) por dia ativo (~{estimatedDays} dia(s) de conteúdo programado automaticamente).
            </p>
          </div>
          {canWrite && (
            <Button
              id="schedule-bulk-instagram"
              size="lg"
              disabled={busySchedule || succeededRenders.length === 0}
              onClick={handleBulkSchedule}
            >
              {busySchedule ? <Spinner /> : null} Programar {totalPostsToCreate} {FORMAT_LABELS[format].title} em Massa
            </Button>
          )}
        </div>
      </Card>

      {/* 5. Fila / Calendário de Publicações Agendadas */}
      {initialSchedules.length > 0 && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-semibold">
                Fila de Publicações Programadas ({initialSchedules.length})
              </h3>
              <p className="text-xs text-muted">
                Você pode ajustar o dia/hora de qualquer item individualmente, publicar agora ou cancelar.
              </p>
            </div>
          </div>

          <div className="max-h-[32rem] overflow-y-auto pr-1">
            <ul className="divide-y divide-border">
              {initialSchedules.map((item) => {
                const st = STATUS_BADGE[item.status] ?? { label: item.status, tone: "neutral" as const };
                const localVal = editingDateById[item.id] ?? toDatetimeLocalValue(item.scheduledAt);
                const busy = actionBusyId === item.id;
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-[14rem] flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <Badge tone="neutral">{FORMAT_LABELS[item.format]?.title ?? item.format}</Badge>
                        <span className="font-mono text-xs font-semibold">{item.codes.join(" + ")}</span>
                        <span className="text-xs text-muted">→ {item.accountName}</span>
                      </div>
                      {item.caption && <p className="line-clamp-1 text-xs text-muted">{item.caption}</p>}
                      {item.errorPt && <p className="text-xs text-danger">{item.errorPt}</p>}
                      {item.permalink && (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-xs text-primary underline"
                        >
                          Ver publicação no Instagram ↗
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
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
                            Publicar agora
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
