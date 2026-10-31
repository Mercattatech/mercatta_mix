"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Input, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

const NETWORKS = [
  { id: "instagram", label: "Instagram Reels" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube_shorts", label: "YouTube Shorts" },
  { id: "facebook", label: "Facebook Reels" },
  { id: "linkedin", label: "LinkedIn" },
] as const;

export function NewProjectForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [networks, setNetworks] = useState<string[]>(["instagram"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, targetNetworks: networks }),
    });
    const json = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !json.id) {
      setError(json.error ?? "Não foi possível criar o projeto.");
      setBusy(false);
      return;
    }
    router.push(`/projects/${json.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-1.5">
        <label htmlFor="project-name" className="text-sm text-muted">Nome do projeto</label>
        <Input id="project-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Campanha de verão — locação de SUVs" autoFocus />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm text-muted">Onde você vai publicar? (usado para avisar de limites de duração)</legend>
        <div className="flex flex-wrap gap-2">
          {NETWORKS.map((n) => {
            const on = networks.includes(n.id);
            return (
              <button
                key={n.id}
                type="button"
                aria-pressed={on}
                onClick={() => setNetworks((cur) => (on ? cur.filter((x) => x !== n.id) : [...cur, n.id]))}
                className={cn("rounded-full border px-4 py-2 text-sm transition", on ? "border-primary/70 bg-primary/20 text-fg" : "border-white/10 text-muted hover:border-white/25 hover:text-fg")}
              >
                {n.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && <Alert>{error}</Alert>}
      <Button id="create-project" type="submit" size="lg" disabled={busy || !name.trim()} aria-busy={busy}>
        {busy ? <Spinner /> : null} Criar projeto
      </Button>
    </form>
  );
}
