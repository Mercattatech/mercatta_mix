"use client";

import { useState } from "react";
import { Alert, Button, Input, Spinner } from "@/components/ui";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(json.error ?? "Não foi possível enviar o link agora. Tente de novo em instantes.");
      else setSent(true);
    } catch {
      setError("Sem conexão. Confira a internet e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4" id="login-sent">
        <Alert tone="success">
          Se <strong>{email.trim()}</strong> tiver acesso, enviamos um link para entrar. Confira a caixa de entrada (e o spam). O link vale por 15 minutos.
        </Alert>
        <button type="button" onClick={() => setSent(false)} className="w-full text-center text-sm text-muted underline-offset-4 transition hover:text-fg hover:underline">
          Usar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {linkError && <Alert tone="warn">Esse link venceu ou já foi usado. Peça um novo abaixo.</Alert>}
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm text-muted">
          E-mail
        </label>
        <Input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button id="login-submit" type="submit" size="lg" className="w-full" disabled={busy || !email.trim()} aria-busy={busy}>
        {busy ? <Spinner /> : null} Receber link por e-mail
      </Button>
      <p className="text-center text-xs text-muted">Sem senha: a gente manda um link de acesso para o seu e-mail.</p>
    </form>
  );
}
