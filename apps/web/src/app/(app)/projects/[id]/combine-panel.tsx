"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { TYPE_LABELS, cn, formatDuration } from "@/lib/utils";
import type { PricingConfig } from "@mercatta/server";
import type { SegmentRow } from "./types";

interface Preview {
  count: number;
  creditsPerVideo: number;
  credits: number;
  violations: { code: string; network: string; totalMs: number; limitMs: number; overByMs: number }[];
}

type ScaleMode = "small" | "medium" | "total" | "custom";

const NETWORK_NAMES: Record<string, string> = {
  instagram: "Instagram Reels",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  facebook: "Facebook Reels",
  linkedin: "LinkedIn",
};

const FONTS = [
  { id: "DejaVu Sans", label: "DejaVu Sans (Padrão)" },
  { id: "Montserrat", label: "Montserrat" },
  { id: "Inter", label: "Inter" },
  { id: "Roboto", label: "Roboto" },
  { id: "Arial", label: "Arial" },
  { id: "Impact", label: "Impact" },
];

const HIGHLIGHT_COLORS = [
  { hex: "#FFD400", name: "Amarelo" },
  { hex: "#34D399", name: "Verde" },
  { hex: "#FF7A59", name: "Coral" },
  { hex: "#8B5CF6", name: "Roxo" },
  { hex: "#FFFFFF", name: "Branco" },
  { hex: "#38BDF8", name: "Azul Claro" },
];

function computeScaleCounts(total: number) {
  if (total <= 1) {
    return { small: 1, medium: 1, total: 1 };
  }
  if (total === 2) {
    return { small: 1, medium: 2, total: 2 };
  }
  if (total === 3) {
    return { small: 1, medium: 2, total: 3 };
  }
  if (total <= 8) {
    return {
      small: Math.max(1, Math.round(total * 0.3)),
      medium: Math.max(2, Math.round(total * 0.6)),
      total,
    };
  }
  return {
    small: Math.max(3, Math.min(10, Math.round(total * 0.2))),
    medium: Math.max(5, Math.min(30, Math.round(total * 0.5))),
    total,
  };
}

export function CombinePanel({
  projectId,
  segments,
  credits,
  canWrite,
  initialSettings = {},
  initialInstructions = "",
  pricing,
}: {
  projectId: string;
  segments: SegmentRow[];
  credits: number | null;
  canWrite: boolean;
  initialSettings?: Record<string, unknown>;
  initialInstructions?: string;
  pricing?: PricingConfig;
}) {
  const router = useRouter();
  const counts = { hook: 0, body: 0, cta: 0, extra: 0 };
  for (const s of segments) counts[s.type]++;
  const signature = `${counts.hook}-${counts.body}-${counts.cta}-${counts.extra}-${segments.map((s) => s.id).join(",")}`;
  const complete = counts.hook > 0 || counts.body > 0 || counts.cta > 0;

  const [extraPosition, setExtraPosition] = useState<"afterHook" | "afterBody" | "afterCta">("afterBody");
  const [extraMode, setExtraMode] = useState<"include" | "optional">("include");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("total");
  const [customN, setCustomN] = useState<number>(1);

  // Opções de Legenda, B-Rolls e Instruções de Edição
  const initCap = (initialSettings.caption_style as Record<string, unknown>) ?? {};
  const [burnCaptions, setBurnCaptions] = useState<boolean>(initialSettings.burn_captions !== false);
  const [fontName, setFontName] = useState<string>((initCap.fontName as string) ?? "DejaVu Sans");
  const [fontSize, setFontSize] = useState<number>((initCap.fontSize as number) ?? 78);
  const [highlightColor, setHighlightColor] = useState<string>((initCap.highlightColor as string) ?? "#FFD400");
  const [captionMode, setCaptionMode] = useState<"karaoke" | "static">((initCap.mode as "karaoke" | "static") ?? "karaoke");
  const [captionPosition, setCaptionPosition] = useState<"top" | "middle" | "bottom">((initCap.position as "top" | "middle" | "bottom") ?? "bottom");

  const [useBrolls, setUseBrolls] = useState<boolean>(Boolean(initialSettings.use_b_rolls));
  const [editingInstructions, setEditingInstructions] = useState<string>(initialInstructions);

  const [loaded, setLoaded] = useState<{ signature: string; preview: Preview } | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedSettingsMsg, setSavedSettingsMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = complete && loaded?.signature === signature ? loaded.preview : null;
  const loading = complete && preview === null && error === null;

  useEffect(() => {
    if (!complete) return;
    let canceled = false;
    fetch(`/api/projects/${projectId}/combinations`)
      .then(async (res) => ({ ok: res.ok, json: (await res.json().catch(() => ({}))) as Preview & { error?: string } }))
      .then(({ ok, json }) => {
        if (canceled) return;
        if (ok) {
          setError(null);
          setLoaded({ signature, preview: json });
        } else setError(json.error ?? "Não foi possível calcular a prévia.");
      })
      .catch(() => !canceled && setError("Não foi possível calcular a prévia."));
    return () => {
      canceled = true;
    };
  }, [projectId, signature, complete]);

  const scaleCounts = useMemo(() => {
    if (!preview) return { small: 1, medium: 1, total: 1 };
    return computeScaleCounts(preview.count);
  }, [preview]);

  const effectiveCount = useMemo(() => {
    if (!preview) return 0;
    if (scaleMode === "small") return scaleCounts.small;
    if (scaleMode === "medium") return scaleCounts.medium;
    if (scaleMode === "custom") return Math.max(1, Math.min(preview.count, customN));
    return scaleCounts.total;
  }, [scaleMode, scaleCounts, preview, customN]);

  // Cálculo de desconto por pacote conforme precificação do admin
  const discountPercent = useMemo(() => {
    if (!pricing) return 0;
    if (scaleMode === "small") return pricing.packageSmallDiscount;
    if (scaleMode === "medium") return pricing.packageMediumDiscount;
    if (scaleMode === "total") return pricing.packageTotalDiscount;
    return 0;
  }, [scaleMode, pricing]);

  const perVideoCredits = pricing?.perVideoCredits ?? preview?.creditsPerVideo ?? 1;
  const rawCost = effectiveCount * perVideoCredits;
  const creditsNeeded = Math.max(1, Math.round(rawCost * (1 - discountPercent / 100)));
  const notEnough = preview !== null && credits !== null && creditsNeeded > credits;

  async function saveProjectSettings() {
    try {
      await fetch(`/api/projects/${projectId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editingInstructions,
          useBrolls,
          burnCaptions,
          captionStyle: {
            fontName,
            fontSize,
            highlightColor,
            mode: captionMode,
            position: captionPosition,
          },
        }),
      });
      setSavedSettingsMsg("Preferências de edição salvas.");
      setTimeout(() => setSavedSettingsMsg(null), 3000);
    } catch {
      // silencioso
    }
  }

  async function generate() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      // 1. Salva configurações de legenda, B-Roll e instruções antes de disparar
      await fetch(`/api/projects/${projectId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editingInstructions,
          useBrolls,
          burnCaptions,
          captionStyle: {
            fontName,
            fontSize,
            highlightColor,
            mode: captionMode,
            position: captionPosition,
          },
        }),
      });

      // 2. Gera a amostra do pacote selecionado
      const isSample = effectiveCount < preview.count;
      const comb = await fetch(`/api/projects/${projectId}/combinations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(counts.extra > 0 ? { extraPosition, extraMode } : {}),
          ...(isSample ? { sample: { n: effectiveCount } } : {}),
        }),
      });
      const combJson = (await comb.json().catch(() => ({}))) as { error?: string };
      if (!comb.ok) throw new Error(combJson.error ?? "Não foi possível gerar as combinações.");

      // 3. Enfileira a renderização em lote
      const rend = await fetch(`/api/projects/${projectId}/renders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const rendJson = (await rend.json().catch(() => ({}))) as { error?: string };
      if (!rend.ok) throw new Error(rendJson.error ?? "Não foi possível iniciar a geração dos vídeos.");

      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const byNetwork = new Map<string, { n: number; limitMs: number }>();
  for (const v of preview?.violations ?? []) {
    const cur = byNetwork.get(v.network) ?? { n: 0, limitMs: v.limitMs };
    cur.n++;
    byNetwork.set(v.network, cur);
  }

  return (
    <section aria-labelledby="combine-title" className="space-y-4">
      <div>
        <h2 id="combine-title" className="font-display text-2xl font-semibold">
          3. Combine e gere
        </h2>
        <p className="mt-1 text-sm text-muted">
          A sequência é sempre: <strong>Gancho → Conteúdo → Extra → Chamada (CTA no fim)</strong>. Configure legendas, B-Rolls e gere por pacote.
        </p>
      </div>

      <Card className="space-y-6">
        {/* Contagem dos tipos */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-xl">
          {(["hook", "body", "cta"] as const).map((t, i) => (
            <span key={t} className="flex items-center gap-3">
              {i > 0 && <span className="text-muted">×</span>}
              <span>
                <strong className="gradient-text text-3xl">{counts[t]}</strong>{" "}
                <span className="text-base text-muted">{t === "body" ? "conteúdo(s)" : `${TYPE_LABELS[t].toLowerCase()}(s)`}</span>
              </span>
            </span>
          ))}
          {counts.extra > 0 && <span className="text-base text-muted">+ {counts.extra} extra(s)</span>}
          {complete && preview && (
            <span className="flex items-center gap-3">
              <span className="text-muted">=</span>
              <span id="combo-count">
                <strong className="gradient-text text-4xl">{preview.count}</strong>{" "}
                <span className="text-base text-muted">vídeos possíveis</span>
              </span>
            </span>
          )}
          {loading && <Spinner />}
        </div>

        {!complete && <Alert tone="primary">Salve pelo menos 1 trecho (gancho, conteúdo ou chamada) para gerar vídeos.</Alert>}

        {/* Bloco de Legendas e Estilo */}
        <div className="rounded-xl border border-border bg-surface-2 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-fg">Legendas e Estilo Visual</h3>
              <p className="text-xs text-muted">Defina se deseja queimar legendas dinâmicas nos vídeos e personalize tipografia e cores.</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
              <input
                type="checkbox"
                checked={burnCaptions}
                onChange={(e) => {
                  setBurnCaptions(e.target.checked);
                  void saveProjectSettings();
                }}
                className="size-4 rounded accent-primary cursor-pointer"
              />
              <span>Ativar legendas no vídeo</span>
            </label>
          </div>

          {burnCaptions && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-border">
              {/* Fonte */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Fonte</label>
                <select
                  value={fontName}
                  onChange={(e) => {
                    setFontName(e.target.value);
                    void saveProjectSettings();
                  }}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg"
                >
                  {FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Modo de Legenda */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Modo de Animação</label>
                <select
                  value={captionMode}
                  onChange={(e) => {
                    setCaptionMode(e.target.value as "karaoke" | "static");
                    void saveProjectSettings();
                  }}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg"
                >
                  <option value="karaoke">Karaokê (palavra a palavra)</option>
                  <option value="static">Estático (linha inteira)</option>
                </select>
              </div>

              {/* Cor de Destaque */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Cor de Destaque</label>
                <select
                  value={highlightColor}
                  onChange={(e) => {
                    setHighlightColor(e.target.value);
                    void saveProjectSettings();
                  }}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg"
                >
                  {HIGHLIGHT_COLORS.map((c) => (
                    <option key={c.hex} value={c.hex}>
                      {c.name} ({c.hex})
                    </option>
                  ))}
                </select>
              </div>

              {/* Posição */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Posição na Tela</label>
                <select
                  value={captionPosition}
                  onChange={(e) => {
                    setCaptionPosition(e.target.value as "top" | "middle" | "bottom");
                    void saveProjectSettings();
                  }}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg"
                >
                  <option value="bottom">Inferior (Padrão Reels/Shorts)</option>
                  <option value="middle">Centro</option>
                  <option value="top">Superior</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Bloco de B-Rolls e Instruções de Edição */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Opção B-Rolls */}
          <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="b-rolls" className="text-sm font-medium text-fg">
                B-Rolls (Imagens / Cenas de apoio)
              </label>
              <input
                id="b-rolls"
                type="checkbox"
                checked={useBrolls}
                onChange={(e) => {
                  setUseBrolls(e.target.checked);
                  void saveProjectSettings();
                }}
                className="size-4 rounded accent-primary cursor-pointer"
              />
            </div>
            <p className="text-xs text-muted">
              {useBrolls
                ? "Ativado: trechos do tipo Extra serão tratados como imagens de apoio (B-Rolls) na timeline."
                : "Desativado: vídeo composto apenas pelos cortes diretos de gancho, conteúdo e CTA."}
            </p>
          </div>

          {/* Instruções para a Edição */}
          <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="instructions" className="text-sm font-medium text-fg">
                Instruções para a Edição
              </label>
              {savedSettingsMsg && <span className="text-xs text-success font-medium">{savedSettingsMsg}</span>}
            </div>
            <textarea
              id="instructions"
              rows={2}
              maxLength={1000}
              placeholder="Ex: Cortes rápidos no gancho, manter ritmo dinâmico, zoom sutil no CTA..."
              value={editingInstructions}
              onChange={(e) => setEditingInstructions(e.target.value)}
              onBlur={() => void saveProjectSettings()}
              className="w-full rounded-lg border border-border bg-surface p-2.5 text-xs text-fg placeholder:text-muted/70 focus:border-primary/70 focus:outline-none"
            />
          </div>
        </div>

        {/* Seleção de Pacotes */}
        {preview && (
          <div className="space-y-4 pt-2">
            <div>
              <h3 className="text-base font-semibold text-fg">Pacotes de Combinações</h3>
              <p className="text-xs text-muted">
                Escolha o pacote desejado para gerar os vídeos deste lote. Todos os vídeos do pacote serão gerados e ficarão disponíveis para download imediato em ZIP.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Pacote Pequeno */}
              <button
                type="button"
                id="package-small"
                onClick={() => setScaleMode("small")}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-4 text-left transition",
                  scaleMode === "small"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display font-semibold text-fg">Pacote Pequeno</span>
                  <Badge tone={scaleMode === "small" ? "primary" : "neutral"}>
                    {scaleCounts.small} {scaleCounts.small === 1 ? "vídeo" : "vídeos"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted">Amostra rápida para validar ganchos e CTAs</p>
                <div className="mt-3 font-display text-sm font-semibold text-primary">
                  ✦ {Math.max(1, Math.round(scaleCounts.small * perVideoCredits * (1 - (pricing?.packageSmallDiscount ?? 0) / 100)))}{" "}
                  créditos {pricing?.packageSmallDiscount ? `(${pricing.packageSmallDiscount}% off)` : ""}
                </div>
              </button>

              {/* Pacote Médio */}
              <button
                type="button"
                id="package-medium"
                onClick={() => setScaleMode("medium")}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-4 text-left transition",
                  scaleMode === "medium"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display font-semibold text-fg">Pacote Médio</span>
                  <Badge tone={scaleMode === "medium" ? "primary" : "neutral"}>
                    {scaleCounts.medium} {scaleCounts.medium === 1 ? "vídeo" : "vídeos"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted">Variedade equilibrada cobrindo as mensagens</p>
                <div className="mt-3 font-display text-sm font-semibold text-primary">
                  ✦ {Math.max(1, Math.round(scaleCounts.medium * perVideoCredits * (1 - (pricing?.packageMediumDiscount ?? 10) / 100)))}{" "}
                  créditos {pricing?.packageMediumDiscount ? `(${pricing.packageMediumDiscount}% off)` : ""}
                </div>
              </button>

              {/* Pacote Total */}
              <button
                type="button"
                id="package-total"
                onClick={() => setScaleMode("total")}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-4 text-left transition",
                  scaleMode === "total"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display font-semibold text-fg">Pacote Total</span>
                  <Badge tone={scaleMode === "total" ? "primary" : "neutral"}>
                    {scaleCounts.total} {scaleCounts.total === 1 ? "vídeo" : "vídeos"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted">100% de todas as combinações possíveis</p>
                <div className="mt-3 font-display text-sm font-semibold text-primary">
                  ✦ {Math.max(1, Math.round(scaleCounts.total * perVideoCredits * (1 - (pricing?.packageTotalDiscount ?? 20) / 100)))}{" "}
                  créditos {pricing?.packageTotalDiscount ? `(${pricing.packageTotalDiscount}% off)` : ""}
                </div>
              </button>
            </div>

            {preview.count > 3 && (
              <div className="flex items-center gap-3 pt-1 text-sm text-muted">
                <button
                  type="button"
                  onClick={() => setScaleMode(scaleMode === "custom" ? "total" : "custom")}
                  className="underline hover:text-fg text-xs"
                >
                  {scaleMode === "custom" ? "Voltar para os pacotes" : "Ou digitar quantidade personalizada de vídeos"}
                </button>
                {scaleMode === "custom" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={preview.count}
                      value={customN}
                      onChange={(e) => setCustomN(Math.max(1, Math.min(preview.count, Number(e.target.value) || 1)))}
                      className="h-8 w-20 rounded-lg border border-border bg-surface px-2 text-center text-sm font-medium text-fg"
                    />
                    <span className="text-xs text-muted">vídeos (máx: {preview.count})</span>
                  </div>
                )}
              </div>
            )}

            {/* Demonstração de contagem e créditos */}
            <dl className="grid gap-3 sm:grid-cols-4">
              <Stat label="Total possível" value={String(preview.count)} hint="Todas as variações" />
              <Stat
                label="Vídeos do Pacote"
                value={String(effectiveCount)}
                hint={`${Math.round((effectiveCount / preview.count) * 100)}% das combinações`}
              />
              <Stat
                label="Custo do Pacote"
                value={`${creditsNeeded} créditos`}
                hint={discountPercent > 0 ? `${discountPercent}% de desconto` : `${perVideoCredits} por vídeo`}
              />
              <Stat label="Seu saldo" value={credits === null ? "—" : `${credits} créditos`} tone={notEnough ? "danger" : undefined} />
            </dl>
          </div>
        )}

        {notEnough && <Alert>Saldo insuficiente: faltam {creditsNeeded - (credits ?? 0)} créditos. Fale com o Grupo Mercatta para adicionar.</Alert>}

        {[...byNetwork.entries()].map(([network, v]) => (
          <Alert key={network} tone="warn">
            {v.n} vídeo(s) passam de {formatDuration(v.limitMs)} e podem ser recusados pelo {NETWORK_NAMES[network] ?? network}. Encurte os trechos para evitar.
          </Alert>
        ))}

        {error && <Alert>{error}</Alert>}

        {canWrite && (
          <Button
            id="generate"
            size="lg"
            disabled={!complete || busy || loading || notEnough || !preview || effectiveCount === 0}
            aria-busy={busy}
            onClick={() => void generate()}
          >
            {busy && <Spinner />}
            {preview
              ? `Gerar ${effectiveCount} ${effectiveCount === 1 ? "vídeo" : "vídeos"} do pacote agora (✦ ${creditsNeeded} créditos)`
              : "Gerar pacote de vídeos"}
          </Button>
        )}
      </Card>
    </section>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-0.5 font-display text-xl ${tone === "danger" ? "text-danger" : ""}`}>{value}</dd>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
