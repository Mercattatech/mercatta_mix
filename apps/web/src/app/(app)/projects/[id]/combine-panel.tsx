"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Spinner } from "@/components/ui";
import { TYPE_LABELS, formatDuration } from "@/lib/utils";
import type { SegmentRow } from "./types";

interface Preview {
  count: number;
  creditsPerVideo: number;
  credits: number;
  violations: { code: string; network: string; totalMs: number; limitMs: number; overByMs: number }[];
}

const NETWORK_NAMES: Record<string, string> = {
  instagram: "Instagram Reels",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  facebook: "Facebook Reels",
  linkedin: "LinkedIn",
};

/** Mostra quantos vídeos saem das combinações e quanto custam ANTES de gastar crédito. */
export function CombinePanel({ projectId, segments, credits, canWrite }: { projectId: string; segments: SegmentRow[]; credits: number | null; canWrite: boolean }) {
  const router = useRouter();
  const counts = { hook: 0, body: 0, cta: 0, extra: 0 };
  for (const s of segments) counts[s.type]++;
  const signature = `${counts.hook}-${counts.body}-${counts.cta}-${counts.extra}-${segments.map((s) => s.id).join(",")}`;
  const complete = counts.hook > 0 && counts.body > 0 && counts.cta > 0;

  const [extraPosition, setExtraPosition] = useState<"afterHook" | "afterBody" | "afterCta">("afterBody");
  const [extraMode, setExtraMode] = useState<"include" | "optional">("include");
  // a prévia guarda a "assinatura" dos trechos para a qual foi calculada: se os trechos mudam, ela some até a nova chegar
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

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const comb = await fetch(`/api/projects/${projectId}/combinations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(counts.extra > 0 ? { extraPosition, extraMode } : {}),
      });
      const combJson = (await comb.json().catch(() => ({}))) as { error?: string };
      if (!comb.ok) throw new Error(combJson.error ?? "Não foi possível gerar as combinações.");
      const rend = await fetch(`/api/projects/${projectId}/renders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const rendJson = (await rend.json().catch(() => ({}))) as { error?: string };
      if (!rend.ok) throw new Error(rendJson.error ?? "Não foi possível iniciar a geração dos vídeos.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const notEnough = preview !== null && credits !== null && preview.credits > credits;
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
        <p className="mt-1 text-sm text-muted">Cada gancho se junta com cada miolo e cada chamada. Você vê o total e o custo antes de confirmar.</p>
      </div>
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-xl">
          {(["hook", "body", "cta"] as const).map((t, i) => (
            <span key={t} className="flex items-center gap-3">
              {i > 0 && <span className="text-muted">×</span>}
              <span>
                <strong className="gradient-text text-3xl">{counts[t]}</strong> <span className="text-base text-muted">{TYPE_LABELS[t].toLowerCase()}(s)</span>
              </span>
            </span>
          ))}
          {counts.extra > 0 && (
            <span className="text-base text-muted">
              + {counts.extra} extra(s)
            </span>
          )}
          {complete && preview && (
            <span className="flex items-center gap-3">
              <span className="text-muted">=</span>
              <span id="combo-count">
                <strong className="gradient-text text-4xl">{preview.count}</strong> <span className="text-base text-muted">vídeos</span>
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
              <select value={extraPosition} onChange={(e) => setExtraPosition(e.target.value as typeof extraPosition)} className="h-10 w-full rounded-xl border border-white/10 bg-surface px-3 text-fg">
                <option value="afterHook">Depois do gancho</option>
                <option value="afterBody">Depois do miolo</option>
                <option value="afterCta">Depois da chamada</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-muted">
              Como usar
              <select value={extraMode} onChange={(e) => setExtraMode(e.target.value as typeof extraMode)} className="h-10 w-full rounded-xl border border-white/10 bg-surface px-3 text-fg">
                <option value="include">Em todos os vídeos</option>
                <option value="optional">Opcional (com e sem extra)</option>
              </select>
            </label>
          </div>
        )}

        {preview && (
          <dl className="grid gap-3 sm:grid-cols-3">
            <Stat label="Vídeos" value={String(preview.count)} />
            <Stat label="Custo" value={`${preview.credits} créditos`} hint={`${preview.creditsPerVideo} por vídeo`} />
            <Stat label="Seu saldo" value={credits === null ? "—" : `${credits} créditos`} tone={notEnough ? "danger" : undefined} />
          </dl>
        )}

        {notEnough && <Alert>Saldo insuficiente: faltam {preview!.credits - (credits ?? 0)} créditos. Fale com o Grupo Mercatta para adicionar.</Alert>}

        {[...byNetwork.entries()].map(([network, v]) => (
          <Alert key={network} tone="warn">
            {v.n} vídeo(s) passam de {formatDuration(v.limitMs)} e podem ser recusados pelo {NETWORK_NAMES[network] ?? network}. Encurte os trechos para evitar.
          </Alert>
        ))}

        {error && <Alert>{error}</Alert>}

        {canWrite && (
          <Button id="generate" size="lg" disabled={!complete || busy || loading || notEnough || !preview || preview.count === 0} aria-busy={busy} onClick={() => void generate()}>
            {busy && <Spinner />} {preview ? `Gerar ${preview.count} vídeos` : "Gerar vídeos"}
          </Button>
        )}
      </Card>
    </section>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-0.5 font-display text-xl ${tone === "danger" ? "text-danger" : ""}`}>{value}</dd>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
