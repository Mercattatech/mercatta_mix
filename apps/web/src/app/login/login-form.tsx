"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Input, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError("E-mail ou senha incorretos.");
      setBusy(false);
      return;
    }
    router.replace("/projects");
    router.refresh();
  }

  async function magicLink() {
    if (!email.trim()) {
      setError("Digite seu e-mail primeiro.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback?next=/projects` },
    });
    setBusy(false);
    // mesma resposta exista ou não a conta: não revela quem é cliente
    if (error && error.status !== 400 && error.status !== 422) setError("Não foi possível enviar o link agora. Tente de novo em instantes.");
    else setInfo("Se este e-mail tiver acesso, enviamos um link para entrar. Confira sua caixa de entrada.");
  }

  return (
    <form onSubmit={signIn} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm text-muted">E-mail</label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm text-muted">Senha</label>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </div>
      {error && <Alert>{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}
      <Button id="login-submit" type="submit" size="lg" className="w-full" disabled={busy} aria-busy={busy}>
        {busy ? <Spinner /> : null} Entrar
      </Button>
      <button type="button" id="login-magic-link" onClick={magicLink} disabled={busy} className="w-full text-center text-sm text-muted underline-offset-4 transition hover:text-fg hover:underline disabled:opacity-50">
        Entrar com link por e-mail / esqueci a senha
      </button>
    </form>
  );
}
