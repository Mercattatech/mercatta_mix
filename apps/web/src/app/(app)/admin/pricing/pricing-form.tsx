"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Input, Spinner } from "@/components/ui";

interface PricingInitial {
  perVideoCredits: number;
  packageSmallDiscount: number;
  packageMediumDiscount: number;
  packageTotalDiscount: number;
}

export function PricingForm({ initial }: { initial: PricingInitial }) {
  const router = useRouter();
  const [perVideo, setPerVideo] = useState(String(initial.perVideoCredits));
  const [smallDisc, setSmallDisc] = useState(String(initial.packageSmallDiscount));
  const [mediumDisc, setMediumDisc] = useState(String(initial.packageMediumDiscount));
  const [totalDisc, setTotalDisc] = useState(String(initial.packageTotalDiscount));

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const pv = Math.max(1, Number(perVideo) || 1);
  const sd = Math.max(0, Math.min(100, Number(smallDisc) || 0));
  const md = Math.max(0, Math.min(100, Number(mediumDisc) || 0));
  const td = Math.max(0, Math.min(100, Number(totalDisc) || 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perVideoCredits: pv,
          packageSmallDiscount: sd,
          packageMediumDiscount: md,
          packageTotalDiscount: td,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar precificação.");
      setMsg({ tone: "success", text: "Precificação e custos de pacotes atualizados com sucesso!" });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "danger", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-6">
      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="per-video" className="text-sm font-medium text-fg">
            Preço por vídeo individual (créditos)
          </label>
          <p className="text-xs text-muted">
            Quantidade padrão de créditos consumida por cada renderização individual.
          </p>
          <div className="flex items-center gap-2 max-w-xs">
            <Input
              id="per-video"
              type="number"
              min={1}
              max={1000}
              required
              value={perVideo}
              onChange={(e) => setPerVideo(e.target.value)}
            />
            <span className="text-sm text-muted">crédito(s)</span>
          </div>
        </div>

        <hr className="border-border" />

        <div className="space-y-4">
          <div>
            <h3 className="text-base font-medium text-fg">Descontos / Precificação por Pacote</h3>
            <p className="text-xs text-muted">
              Ao gerar pacotes maiores, o sistema calcula os créditos com base na taxa de desconto configurada.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-4">
              <label htmlFor="small-disc" className="text-sm font-medium text-fg">
                Pacote Pequeno
              </label>
              <p className="text-xs text-muted">Amostra rápida (ex: 20% do lote)</p>
              <div className="flex items-center gap-2">
                <Input
                  id="small-disc"
                  type="number"
                  min={0}
                  max={100}
                  value={smallDisc}
                  onChange={(e) => setSmallDisc(e.target.value)}
                />
                <span className="text-sm text-muted">% desc.</span>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-4">
              <label htmlFor="medium-disc" className="text-sm font-medium text-fg">
                Pacote Médio
              </label>
              <p className="text-xs text-muted">Variedade equilibrada (ex: 50% do lote)</p>
              <div className="flex items-center gap-2">
                <Input
                  id="medium-disc"
                  type="number"
                  min={0}
                  max={100}
                  value={mediumDisc}
                  onChange={(e) => setMediumDisc(e.target.value)}
                />
                <span className="text-sm text-muted">% desc.</span>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-4">
              <label htmlFor="total-disc" className="text-sm font-medium text-fg">
                Pacote Total
              </label>
              <p className="text-xs text-muted">100% de todas as combinações</p>
              <div className="flex items-center gap-2">
                <Input
                  id="total-disc"
                  type="number"
                  min={0}
                  max={100}
                  value={totalDisc}
                  onChange={(e) => setTotalDisc(e.target.value)}
                />
                <span className="text-sm text-muted">% desc.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Simulação em tempo real */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Simulação de Exemplo (para um projeto com 20 vídeos possíveis):</p>
          <ul className="text-xs text-muted space-y-1">
            <li>• <strong>Vídeo avulso:</strong> {pv} crédito cada</li>
            <li>• <strong>Pacote Pequeno (4 vídeos):</strong> {Math.max(1, Math.round(4 * pv * (1 - sd / 100)))} créditos {sd > 0 ? `(${sd}% off)` : ""}</li>
            <li>• <strong>Pacote Médio (10 vídeos):</strong> {Math.max(1, Math.round(10 * pv * (1 - md / 100)))} créditos {md > 0 ? `(${md}% off)` : ""}</li>
            <li>• <strong>Pacote Total (20 vídeos):</strong> {Math.max(1, Math.round(20 * pv * (1 - td / 100)))} créditos {td > 0 ? `(${td}% off)` : ""}</li>
          </ul>
        </div>

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <Button type="submit" size="lg" disabled={busy} aria-busy={busy}>
          {busy && <Spinner />} Salvar Precificação
        </Button>
      </form>
    </Card>
  );
}
