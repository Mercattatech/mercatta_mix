"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Card, Input, Spinner } from "@/components/ui";
import { MAIL_PRESETS } from "@/lib/mail-presets";

interface Initial {
  provider: string;
  host: string;
  port: number;
  security: "starttls" | "ssl";
  username: string;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  enabled: boolean;
  updatedAt: string;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}

type Msg = { tone: "success" | "danger"; text: string } | null;

const selectClass = "h-11 w-full rounded-xl border border-white/10 bg-surface px-3 text-sm text-fg focus:border-primary/70 focus:outline-none";

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export function MailForm({ initial, adminEmail, keyConfigured, envFallback }: { initial: Initial | null; adminEmail: string; keyConfigured: boolean; envFallback: string }) {
  const router = useRouter();
  const [provider, setProvider] = useState(initial?.provider ?? "gmail");
  const preset = MAIL_PRESETS.find((p) => p.id === provider) ?? MAIL_PRESETS[MAIL_PRESETS.length - 1]!;
  const [host, setHost] = useState(initial?.host ?? MAIL_PRESETS[0]!.host);
  const [port, setPort] = useState(String(initial?.port ?? MAIL_PRESETS[0]!.port));
  const [security, setSecurity] = useState<"starttls" | "ssl">(initial?.security ?? MAIL_PRESETS[0]!.security);
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState(initial?.fromName ?? "Mercatta Mix");
  const [fromEmail, setFromEmail] = useState(initial?.fromEmail ?? "");
  const [replyTo, setReplyTo] = useState(initial?.replyTo ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [testTo, setTestTo] = useState(adminEmail);
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  function pickPreset(id: string) {
    const p = MAIL_PRESETS.find((x) => x.id === id);
    setProvider(id);
    if (!p) return;
    if (id !== "custom") {
      setHost(p.host);
      setPort(String(p.port));
      setSecurity(p.security);
    }
    if (p.username) setUsername(p.username);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setMsg(null);
    const r = await call("/api/admin/mail-settings", "PUT", {
      provider,
      host,
      port: Number(port),
      security,
      username,
      ...(password ? { password } : {}),
      fromName,
      fromEmail,
      replyTo: replyTo.trim() || null,
      enabled,
    });
    setBusy(null);
    if (!r.ok) return setMsg({ tone: "danger", text: (r.json.error as string) ?? "Não foi possível salvar." });
    setPassword("");
    setMsg({ tone: "success", text: "Configuração salva. Clique em \"Enviar teste\" para confirmar que funciona." });
    router.refresh();
  }

  async function test() {
    setBusy("test");
    setMsg(null);
    const r = await call("/api/admin/mail-settings/test", "POST", { to: testTo });
    setBusy(null);
    setMsg(r.ok ? { tone: "success", text: `Teste enviado para ${String(r.json.to)}. Confira a caixa de entrada (e o spam).` } : { tone: "danger", text: (r.json.error as string) ?? "O teste falhou." });
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Remover o SMTP do painel? Os e-mails voltarão a usar só o que estiver no .env do servidor.")) return;
    setBusy("delete");
    setMsg(null);
    const r = await call("/api/admin/mail-settings", "DELETE");
    setBusy(null);
    if (!r.ok) return setMsg({ tone: "danger", text: (r.json.error as string) ?? "Não foi possível remover." });
    router.refresh();
  }

  const saved = initial !== null;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        {!saved ? (
          <Badge tone="warn">Nenhum SMTP cadastrado</Badge>
        ) : (
          <>
            <Badge tone={initial.enabled ? "success" : "neutral"}>{initial.enabled ? "Ativo" : "Desligado"}</Badge>
            {initial.lastTestOk === true && <Badge tone="success">Último teste: funcionou</Badge>}
            {initial.lastTestOk === false && <Badge tone="danger">Último teste: falhou</Badge>}
            {initial.lastTestOk === null && <Badge tone="warn">Ainda não testado</Badge>}
          </>
        )}
        <span className="text-xs text-muted">
          {saved && initial.enabled ? "Os e-mails saem por este SMTP." : `Sem SMTP ativo aqui, vale o .env do servidor (MAIL_DRIVER=${envFallback}).`}
        </span>
      </Card>

      {initial?.lastTestOk === false && initial.lastTestError && <Alert tone="danger">{initial.lastTestError}</Alert>}

      <form onSubmit={save} className="space-y-4" aria-label="Configuração de SMTP">
        <Card className="space-y-4">
          <Field label="Provedor" htmlFor="mail-provider">
            <select id="mail-provider" value={provider} onChange={(e) => pickPreset(e.target.value)} className={selectClass}>
              {MAIL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Alert tone="primary">{preset.help}</Alert>

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem_11rem]">
            <Field label="Servidor SMTP" htmlFor="mail-host">
              <Input id="mail-host" required placeholder="smtp.exemplo.com" value={host} onChange={(e) => setHost(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Porta" htmlFor="mail-port">
              <Input id="mail-port" required type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
            </Field>
            <Field label="Segurança" htmlFor="mail-security">
              <select id="mail-security" value={security} onChange={(e) => setSecurity(e.target.value as "starttls" | "ssl")} className={selectClass}>
                <option value="starttls">STARTTLS (587)</option>
                <option value="ssl">SSL/TLS (465)</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Usuário" htmlFor="mail-user">
              <Input id="mail-user" required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Senha / chave" htmlFor="mail-password" hint={initial?.hasPassword ? "Já existe uma senha guardada. Deixe em branco para mantê-la." : "Guardada cifrada. Nunca volta para esta tela."}>
              <Input id="mail-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={initial?.hasPassword ? "••••••••••••" : ""} autoComplete="new-password" required={!initial?.hasPassword} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-display text-lg font-medium">Remetente</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome que aparece" htmlFor="mail-from-name">
              <Input id="mail-from-name" required maxLength={120} value={fromName} onChange={(e) => setFromName(e.target.value)} />
            </Field>
            <Field label="E-mail de envio" htmlFor="mail-from-email" hint="Precisa ser o da conta (ou um endereço autorizado no provedor).">
              <Input id="mail-from-email" type="email" required value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="nao-responda@seudominio.com.br" />
            </Field>
          </div>
          <Field label="Responder para (opcional)" htmlFor="mail-reply-to">
            <Input id="mail-reply-to" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input id="mail-enabled" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
            Usar este SMTP para enviar os e-mails da plataforma
          </label>
        </Card>

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <div className="flex flex-wrap gap-3">
          <Button id="mail-save" type="submit" disabled={busy !== null || !keyConfigured} aria-busy={busy === "save"}>
            {busy === "save" && <Spinner />} Salvar
          </Button>
          {saved && (
            <Button id="mail-delete" type="button" variant="danger" disabled={busy !== null} onClick={() => void remove()}>
              Remover
            </Button>
          )}
        </div>
      </form>

      {saved && (
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-medium">Testar</h2>
          <p className="text-sm text-muted">Envia um e-mail de verdade com a configuração salva. Salve antes se mudou algo.</p>
          <div className="flex flex-wrap gap-3">
            <Input id="mail-test-to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Enviar teste para" className="max-w-xs" />
            <Button id="mail-test" type="button" variant="outline" disabled={busy !== null || !keyConfigured} aria-busy={busy === "test"} onClick={() => void test()}>
              {busy === "test" && <Spinner />} Enviar teste
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
