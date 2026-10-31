"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Input, Spinner } from "@/components/ui";

type Org = { id: string; name: string };

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  async function run(url: string, body: unknown, success: (json: Record<string, unknown>) => string, after?: () => void) {
    setBusy(true);
    setMsg(null);
    const r = await post(url, body);
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "danger", text: (r.json.error as string) ?? "Não foi possível concluir." });
    setMsg({ tone: "success", text: success(r.json) });
    after?.();
    router.refresh();
  }
  return { busy, msg, run };
}

export function AdminForms({ orgs }: { orgs: Org[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <NewOrg />
      <Invite orgs={orgs} />
      <Credits orgs={orgs} />
    </div>
  );
}

function NewOrg() {
  const { busy, msg, run } = useAction();
  const [name, setName] = useState("");
  const [credits, setCredits] = useState("0");
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run("/api/admin/orgs", { name, initialCredits: Number(credits) || 0 }, () => `Empresa "${name}" criada.`, () => setName(""));
        }}
      >
        <h2 className="font-display text-lg font-medium">Nova empresa</h2>
        <Input id="org-name" required minLength={2} placeholder="Nome da empresa" value={name} onChange={(e) => setName(e.target.value)} />
        <Input id="org-credits" type="number" min={0} placeholder="Créditos iniciais" value={credits} onChange={(e) => setCredits(e.target.value)} aria-label="Créditos iniciais" />
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button id="create-org" type="submit" disabled={busy} aria-busy={busy}>
          {busy && <Spinner />} Criar empresa
        </Button>
      </form>
    </Card>
  );
}

function OrgSelect({ orgs, value, onChange, id }: { orgs: Org[]; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select id={id} required value={value} onChange={(e) => onChange(e.target.value)} aria-label="Empresa" className="h-11 w-full rounded-xl border border-white/10 bg-surface px-3 text-sm text-fg focus:border-primary/70 focus:outline-none">
      <option value="">Escolha a empresa…</option>
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

function Invite({ orgs }: { orgs: Org[] }) {
  const { busy, msg, run } = useAction();
  const [organizationId, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run("/api/admin/members", { organizationId, email, role }, (j) => (j.invited ? `Convite enviado para ${email}.` : `${email} já tinha conta e foi vinculado.`), () => setEmail(""));
        }}
      >
        <h2 className="font-display text-lg font-medium">Convidar pessoa</h2>
        <OrgSelect id="invite-org" orgs={orgs} value={organizationId} onChange={setOrg} />
        <Input id="invite-email" type="email" required placeholder="email@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Papel" className="h-11 w-full rounded-xl border border-white/10 bg-surface px-3 text-sm text-fg focus:border-primary/70 focus:outline-none">
          <option value="owner">Dono</option>
          <option value="editor">Editor</option>
          <option value="aprovador">Aprovador</option>
        </select>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button id="invite" type="submit" disabled={busy || !organizationId} aria-busy={busy}>
          {busy && <Spinner />} Enviar convite
        </Button>
      </form>
    </Card>
  );
}

function Credits({ orgs }: { orgs: Org[] }) {
  const { busy, msg, run } = useAction();
  const [organizationId, setOrg] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run("/api/admin/credits", { organizationId, amount: Number(amount), ...(note.trim() ? { note } : {}) }, (j) => `Créditos somados. Novo saldo: ${String(j.balance)}.`, () => {
            setAmount("");
            setNote("");
          });
        }}
      >
        <h2 className="font-display text-lg font-medium">Dar créditos</h2>
        <OrgSelect id="credits-org" orgs={orgs} value={organizationId} onChange={setOrg} />
        <Input id="credits-amount" type="number" min={1} required placeholder="Quantidade" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input id="credits-note" maxLength={200} placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button id="grant" type="submit" disabled={busy || !organizationId} aria-busy={busy}>
          {busy && <Spinner />} Somar créditos
        </Button>
      </form>
    </Card>
  );
}
