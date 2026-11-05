"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { TYPE_LABELS, cn, formatDuration } from "@/lib/utils";
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

/** Mostra quantos vídeos saem das combinações e permite escolher entre Pequena, Média ou Total. */
export function CombinePanel({ projectId, segments, credits, canWrite }: { projectId: string; segments: SegmentRow[]; credits: number | null; canWrite: boolean }) {
  const router = useRouter();
  const counts = { hook: 0, body: 0, cta: 0, extra: 0 };
  for (const s of segments) counts[s.type]++;
  const signature = `${counts.hook}-${counts.body}-${counts.cta}-${counts.extra}-${segments.map((s) => s.id).join(",")}`;
  const complete = counts.hook > 0 && counts.body > 0 && counts.cta > 0;

  const [extraPosition, setExtraPosition] = useState<"afterHook" | "afterBody" | "afterCta">("afterBody");
  const [extraMode, setExtraMode] = useState<"include" | "optional">("include");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("total");
  const [customN, setCustomN] = useState<number>(1);

  // a prévia guarda a "assinatura" dos trechos para a qual foi calculada
  const [loaded, setLoaded] = useState<{ signature: string; preview: Preview } | null>(null);
  const [busy, setBusy] = useState(false);
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

  const creditsNeeded = preview ? effectiveCount * preview.creditsPerVideo : 0;
  const notEnough = preview !== null && credits !== null && creditsNeeded > credits;

  async function generate() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
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
          Cada gancho se junta com cada miolo e cada chamada. Escolha a escala de geração e confira os créditos antes de gerar.
        </p>
      </div>
      <Card className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-xl">
          {(["hook", "body", "cta"] as const).map((t, i) => (
            <span key={t} className="flex items-center gap-3">
              {i > 0 && <span className="text-muted">×</span>}
              <span>
                <strong className="gradient-text text-3xl">{counts[t]}</strong>{" "}
                <span className="text-base text-muted">{TYPE_LABELS[t].toLowerCase()}(s)</span>
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

        {!complete && <Alert tone="primary">Salve pelo menos 1 trecho de gancho, 1 de miolo e 1 de chamada para ver as combinações.</Alert>}

        {complete && counts.extra > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-muted">
              Onde entra o extra
              <select
                value={extraPosition}
                onChange={(e) => setExtraPosition(e.target.value as typeof extraPosition)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-fg"
              >
                <option value="afterHook">Depois do gancho</option>
                <option value="afterBody">Depois do miolo</option>
                <option value="afterCta">Depois da chamada</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-muted">
              Como usar
              <select
                value={extraMode}
                onChange={(e) => setExtraMode(e.target.value as typeof extraMode)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-fg"
              >
                <option value="include">Em todos os vídeos</option>
                <option value="optional">Opcional (com e sem extra)</option>
              </select>
            </label>
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-fg">Escala de combinações</p>
              <p className="text-xs text-muted">Selecione quantas combinações deseja renderizar neste lote:</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Opção Pequena */}
              <button
                type="button"
                id="scale-small"
                onClick={() => setScaleMode("small")}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-4 text-left transition",
                  scaleMode === "small"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display font-semibold text-fg">Pequena</span>
                  <Badge tone={scaleMode === "small" ? "primary" : "neutral"}>
                    {scaleCounts.small} {scaleCounts.small === 1 ? "vídeo" : "vídeos"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted">Amostra rápida para teste de ganchos e CTAs</p>
                <div className="mt-3 font-display text-sm font-semibold text-primary">
                  ✦ {scaleCounts.small * preview.creditsPerVideo}{" "}
                  {scaleCounts.small * preview.creditsPerVideo === 1 ? "crédito" : "créditos"}
                </div>
              </button>

              {/* Opção Média */}
              <button
                type="button"
                id="scale-medium"
                onClick={() => setScaleMode("medium")}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-4 text-left transition",
                  scaleMode === "medium"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display font-semibold text-fg">Média</span>
                  <Badge tone={scaleMode === "medium" ? "primary" : "neutral"}>
                    {scaleCounts.medium} {scaleCounts.medium === 1 ? "vídeo" : "vídeos"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted">Variedade equilibrada cobrindo os trechos</p>
                <div className="mt-3 font-display text-sm font-semibold text-primary">
                  ✦ {scaleCounts.medium * preview.creditsPerVideo}{" "}
                  {scaleCounts.medium * preview.creditsPerVideo === 1 ? "crédito" : "créditos"}
                </div>
              </button>

              {/* Opção Total */}
              <button
                type="button"
                id="scale-total"
                onClick={() => setScaleMode("total")}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-4 text-left transition",
                  scaleMode === "total"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display font-semibold text-fg">Total</span>
                  <Badge tone={scaleMode === "total" ? "primary" : "neutral"}>
                    {scaleCounts.total} {scaleCounts.total === 1 ? "vídeo" : "vídeos"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted">100% de todas as combinações possíveis</p>
                <div className="mt-3 font-display text-sm font-semibold text-primary">
                  ✦ {scaleCounts.total * preview.creditsPerVideo}{" "}
                  {scaleCounts.total * preview.creditsPerVideo === 1 ? "crédito" : "créditos"}
                </div>
              </button>
            </div>

            {preview.count > 3 && (
              <div className="flex items-center gap-3 pt-1 text-sm text-muted">
                <button
                  type="button"
                  onClick={() => setScaleMode(scaleMode === "custom" ? "total" : "custom")}
                  className="underline hover:text-fg"
                >
                  {scaleMode === "custom" ? "Voltar para opções pré-definidas" : "Ou definir quantidade personalizada"}
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

            <dl className="grid gap-3 sm:grid-cols-4">
              <Stat label="Total possível" value={String(preview.count)} hint="Todas as combinações" />
              <Stat label="Vídeos a gerar" value={String(effectiveCount)} hint={`${Math.round((effectiveCount / preview.count) * 100)}% do total`} />
              <Stat label="Custo em créditos" value={`${creditsNeeded} créditos`} hint={`${preview.creditsPerVideo} por vídeo`} />
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
            {busy && <Spinner />} {preview ? `Gerar ${effectiveCount} ${effectiveCount === 1 ? "vídeo" : "vídeos"} agora (${creditsNeeded} créditos)` : "Gerar vídeos"}
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
