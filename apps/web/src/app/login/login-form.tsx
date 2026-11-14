"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Spinner } from "@/components/ui";

export function LoginForm({ linkError: _linkError }: { linkError: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("grupomercatta@gmail.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || "grupomercatta@gmail.com" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        setError(json.error ?? "Não foi possível entrar agora. Tente de novo em instantes.");
      } else {
        router.push(json.redirectTo ?? "/projects");
        router.refresh();
      }
    } catch {
      setError("Sem conexão. Confira a internet e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm text-muted">
          E-mail (opcional)
        </label>
        <Input id="email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="grupomercatta@gmail.com" />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button id="login-submit" type="submit" size="lg" className="w-full" disabled={busy} aria-busy={busy}>
        {busy ? <Spinner /> : null} Entrar direto (sem senha)
      </Button>
      <p className="text-center text-xs text-muted">Acesso liberado sem senha ou confirmação por e-mail.</p>
    </form>
  );
}
