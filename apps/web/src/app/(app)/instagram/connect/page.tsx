"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Spinner } from "@/components/ui";

export default function InstagramConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; erro?: string }>;
}) {
  const params = use(searchParams);
  const returnTo = params.returnTo || "/instagram";
  const router = useRouter();

  const [username, setUsername] = useState("@mercatta.oficial");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.erro ?? null);

  // Opção avançada: Configurar OAuth App da Meta para redirecionamento oficial
  const [showMetaAppConfig, setShowMetaAppConfig] = useState(false);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [savingApp, setSavingApp] = useState(false);

  async function handleOneClickConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const clean = username.trim().replace(/^@/, "") || "mercatta.oficial";
      const res = await fetch("/api/instagram/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `@${clean}`,
          username: clean,
          verifyWithMeta: false,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível conectar a conta.");
        return;
      }
      router.push(returnTo);
      router.refresh();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMetaApp(e: React.FormEvent) {
    e.preventDefault();
    setSavingApp(true);
    setError(null);
    try {
      const res = await fetch("/api/instagram/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, appSecret }),
      });
      if (!res.ok) {
        setError("Não foi possível salvar as credenciais do App Meta.");
        return;
      }
      window.location.href = `/api/instagram/oauth/start?returnTo=${encodeURIComponent(returnTo)}`;
    } finally {
      setSavingApp(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card className="space-y-6 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-white shadow-lg">
            <svg viewBox="0 0 24 24" className="h-9 w-9 fill-current" aria-hidden="true">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          </div>
          <h1 className="font-display mt-4 text-2xl font-semibold">Conectar conta do Instagram</h1>
          <p className="mt-1 text-sm text-muted">
            Conecte seu perfil profissional para agendar seus criativos em Reels, Post e Carrossel.
          </p>
        </div>

        {error && <Alert>{error}</Alert>}

        <form onSubmit={handleOneClickConnect} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted uppercase tracking-wider">Seu @perfil do Instagram</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@suaempresa"
              autoFocus
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-5 font-display text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-50"
          >
            {busy ? <Spinner /> : null}
            Autorizar e Conectar Instagram
          </button>
        </form>

        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowMetaAppConfig((v) => !v)}
            className="w-full text-center text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            {showMetaAppConfig
              ? "Ocultar configuração de App OAuth Meta"
              : "Já possui App ID / Secret na Meta Developers? Configurar login OAuth oficial"}
          </button>

          {showMetaAppConfig && (
            <form onSubmit={handleSaveMetaApp} className="mt-4 space-y-3 rounded-xl border border-border bg-surface-2/50 p-4">
              <p className="text-xs text-muted">
                Callback URL para cadastrar no painel da Meta:{" "}
                <code className="text-fg">{typeof window !== "undefined" ? `${window.location.origin}/api/instagram/oauth/callback` : "/api/instagram/oauth/callback"}</code>
              </p>
              <div className="space-y-1">
                <label className="text-xs text-muted">Instagram / Meta App ID</label>
                <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="Ex.: 104928374619283" required />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">App Secret</label>
                <Input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="••••••••••••" required />
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={savingApp}>
                {savingApp ? <Spinner /> : null} Salvar e Redirecionar para Login Oficial do Instagram
              </Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
