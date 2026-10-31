"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Input, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use ao menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não são iguais.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    if (error) {
      setError("Não foi possível salvar a senha. Tente de novo.");
      setBusy(false);
      return;
    }
    router.replace("/projects");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="new-password" className="text-sm text-muted">Nova senha</label>
        <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm-password" className="text-sm text-muted">Repita a senha</label>
        <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button id="set-password-submit" type="submit" size="lg" className="w-full" disabled={busy} aria-busy={busy}>
        {busy ? <Spinner /> : null} Salvar e entrar
      </Button>
    </form>
  );
}
