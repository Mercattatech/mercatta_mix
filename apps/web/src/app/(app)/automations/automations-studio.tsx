"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CollectLeadField,
  InstagramAccountView,
  InstagramAutomationSessionView,
  InstagramAutomationView,
  MatchMode,
  SimulationStepResult,
  TriggerType,
} from "@mercatta/server";
import { Alert, Badge, Button, Card, Input, Spinner } from "@/components/ui";

const PRESET_TEMPLATES = [
  {
    id: "reel_lead_magnet",
    badge: "🔥 Mais usado",
    title: "Isca Digital nos Reels (Comente QUERO + Só entrega se seguir)",
    desc: "Responde o comentário no Reel, chama no Direct, verifica se segue o perfil e libera o link.",
    triggerType: "comment" as TriggerType,
    matchMode: "contains" as MatchMode,
    keywords: ["QUERO", "EU QUERO", "LINK", "ACESSO", "MATERIAL"],
    replyToComment: true,
    commentReplies: [
      "Acabei de te enviar no Direct! Dá uma olhada nas suas mensagens 🔥",
      "Te chamei na DM com o acesso! Confere lá 📩",
      "Enviado no seu Direct agora mesmo! 🚀",
    ],
    requireFollow: true,
    followGateMessage:
      "Opa, {nome}! Vi seu comentário 👋\n\nPara liberar o seu acesso exclusivo gratuitamente, eu só preciso confirmar que você já segue o nosso perfil {conta}.\n\n👉 Siga {conta} e toque no botão abaixo para receber na hora:",
    followGateButtonLabel: "✅ Já sigo! Liberar meu acesso",
    notFollowingMessage:
      "Hmm, acabei de verificar aqui e parece que você ainda não está seguindo {conta} 👀\n\n1️⃣ Entre no perfil {conta} e clique em Seguir\n2️⃣ Volte aqui e clique em '✅ Já sigo!' que o sistema libera na mesma hora!",
    collectLeadField: "none" as CollectLeadField,
    collectLeadPrompt: "",
    dmMessage:
      "Confirmado que você é nosso seguidor! 🎉\n\nAqui está o acesso prometido. Toque no botão abaixo para abrir agora:",
    dmButtonTitle: "Abrir Acesso Exclusivo 🚀",
    dmButtonUrl: "https://grupomercatta.com.br",
  },
  {
    id: "whatsapp_capture",
    badge: "📲 Captura de Lead",
    title: "Capturar WhatsApp + Trava de Seguidor (ORÇAMENTO / VIP)",
    desc: "Responde o comentário, exige seguir o perfil, pede o WhatsApp no Direct e salva no CRM.",
    triggerType: "any" as TriggerType,
    matchMode: "contains" as MatchMode,
    keywords: ["ORCAMENTO", "CONSULTORIA", "VIP", "PRECO", "CONTATO"],
    replyToComment: true,
    commentReplies: [
      "Te mandei os detalhes no Direct agora! Confere lá 💬",
      "Acabei de te chamar no Direct para te passar tudo! 🚀",
    ],
    requireFollow: true,
    followGateMessage:
      "Olá, {nome}! Que bom ver seu interesse 🚀\n\nAntes de te enviar o atendimento VIP e condições especiais, siga nosso perfil {conta} e clique no botão abaixo:",
    followGateButtonLabel: "✅ Já sigo! Continuar",
    notFollowingMessage:
      "Verifiquei aqui e você ainda não segue {conta} 👀 Siga nosso perfil primeiro e depois clique no botão abaixo para liberar!",
    collectLeadField: "whatsapp" as CollectLeadField,
    collectLeadPrompt:
      "Show! Você já segue nosso perfil ✅\n\nAgora me digita aqui o seu WhatsApp com DDD (ex.: 11999999999) para nossa equipe te enviar a proposta e liberar o link:",
    dmMessage:
      "Perfeito, WhatsApp registrado com sucesso! 🎯\n\nVocê também já pode falar direto com nosso time clicando no botão abaixo:",
    dmButtonTitle: "Falar no WhatsApp Agora 💬",
    dmButtonUrl: "https://wa.me/5511999999999",
  },
  {
    id: "story_vip",
    badge: "⚡ Direct / Story",
    title: "Resposta de Story ou Direct → Enviar Oferta / Link",
    desc: "Quando alguém responde seu Story ou manda palavra-chave na DM, verifica se segue e envia o link.",
    triggerType: "any" as TriggerType,
    matchMode: "contains" as MatchMode,
    keywords: ["OFERTA", "CUPOM", "DESCONTO", " CATALOGO"],
    replyToComment: false,
    commentReplies: [],
    requireFollow: true,
    followGateMessage:
      "Opa, {nome}! Esse cupom/oferta é exclusivo para seguidores do perfil {conta} 🎁\n\nSiga nosso perfil e clique no botão abaixo para desbloquear:",
    followGateButtonLabel: "✅ Já sigo! Ver oferta",
    notFollowingMessage:
      "Ainda não encontrei você entre os seguidores de {conta} 👀 Siga o perfil primeiro e toque no botão abaixo!",
    collectLeadField: "none" as CollectLeadField,
    collectLeadPrompt: "",
    dmMessage: "Oferta desbloqueada com sucesso! 🎉 Acesse pelo botão abaixo:",
    dmButtonTitle: "Resgatar Oferta 🎁",
    dmButtonUrl: "https://grupomercatta.com.br",
  },
];

export function AutomationsStudio({
  accounts,
  initialAutomations,
  initialSessions,
  webhookUrl,
}: {
  accounts: InstagramAccountView[];
  initialAutomations: InstagramAutomationView[];
  initialSessions: InstagramAutomationSessionView[];
  webhookUrl: string;
}) {
  const router = useRouter();
  const defaultAcc = useMemo(
    () => accounts.find((a) => a.username === "grupomercatta") ?? accounts[0] ?? null,
    [accounts],
  );

  const [selectedAutoId, setSelectedAutoId] = useState<string>(initialAutomations[0]?.id ?? "new");
  const activeAuto = useMemo(
    () => initialAutomations.find((a) => a.id === selectedAutoId) ?? null,
    [initialAutomations, selectedAutoId],
  );

  // Estado do formulário do Construtor Visual (Flow Builder)
  const [accountId, setAccountId] = useState<string>(
    activeAuto?.instagramAccountId ?? defaultAcc?.id ?? "",
  );
  const [accountSearch, setAccountSearch] = useState<string>("");
  const [name, setName] = useState<string>(
    activeAuto?.name ?? PRESET_TEMPLATES[0]!.title,
  );
  const [triggerType, setTriggerType] = useState<TriggerType>(
    activeAuto?.triggerType ?? "comment",
  );
  const [matchMode, setMatchMode] = useState<MatchMode>(
    activeAuto?.matchMode ?? "contains",
  );
  const [keywordsText, setKeywordsText] = useState<string>(
    (activeAuto?.keywords ?? PRESET_TEMPLATES[0]!.keywords).join(", "),
  );
  const [replyToComment, setReplyToComment] = useState<boolean>(
    activeAuto?.replyToComment ?? true,
  );
  const [commentRepliesText, setCommentRepliesText] = useState<string>(
    (activeAuto?.commentReplies ?? PRESET_TEMPLATES[0]!.commentReplies).join("\n"),
  );
  const [requireFollow, setRequireFollow] = useState<boolean>(
    activeAuto?.requireFollow ?? true,
  );
  const [followGateMessage, setFollowGateMessage] = useState<string>(
    activeAuto?.followGateMessage ?? PRESET_TEMPLATES[0]!.followGateMessage,
  );
  const [followGateButtonLabel, setFollowGateButtonLabel] = useState<string>(
    activeAuto?.followGateButtonLabel ?? PRESET_TEMPLATES[0]!.followGateButtonLabel,
  );
  const [notFollowingMessage, setNotFollowingMessage] = useState<string>(
    activeAuto?.notFollowingMessage ?? PRESET_TEMPLATES[0]!.notFollowingMessage,
  );
  const [collectLeadField, setCollectLeadField] = useState<CollectLeadField>(
    activeAuto?.collectLeadField ?? "none",
  );
  const [collectLeadPrompt, setCollectLeadPrompt] = useState<string>(
    activeAuto?.collectLeadPrompt ?? "",
  );
  const [dmMessage, setDmMessage] = useState<string>(
    activeAuto?.dmMessage ?? PRESET_TEMPLATES[0]!.dmMessage,
  );
  const [dmButtonTitle, setDmButtonTitle] = useState<string>(
    activeAuto?.dmButtonTitle ?? PRESET_TEMPLATES[0]!.dmButtonTitle,
  );
  const [dmButtonUrl, setDmButtonUrl] = useState<string>(
    activeAuto?.dmButtonUrl ?? PRESET_TEMPLATES[0]!.dmButtonUrl,
  );

  // Estado do Simulador Interativo do Instagram
  const [simUsername, setSimUsername] = useState<string>("cliente.interessado");
  const [simCommentText, setSimCommentText] = useState<string>("EU QUERO");
  const [simIsFollowing, setSimIsFollowing] = useState<boolean>(false);
  const [simLeadInput, setSimLeadInput] = useState<string>("11998887766");
  const [simSessionId, setSimSessionId] = useState<string | null>(null);
  const [simStage, setSimStage] = useState<string>("idle");
  const [simFeed, setSimFeed] = useState<
    Array<{
      sender: "user_comment" | "bot_comment" | "user_dm" | "bot_dm";
      text: string;
      buttonTitle?: string;
      buttonUrl?: string;
      quickReplyLabel?: string;
    }>
  >([]);

  const [busySave, setBusySave] = useState(false);
  const [busySim, setBusySim] = useState(false);
  const [busySync, setBusySync] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => (a.username?.toLowerCase().includes(q) ?? false) || a.name.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);

  const totals = useMemo(() => {
    return initialAutomations.reduce(
      (acc, item) => ({
        triggers: acc.triggers + item.triggersCount,
        comments: acc.comments + item.commentRepliesCount,
        dms: acc.dms + item.dmsSentCount,
        followers: acc.followers + item.followersGainedCount,
        leads: acc.leads + item.leadsCapturedCount,
      }),
      { triggers: 0, comments: 0, dms: 0, followers: 0, leads: 0 },
    );
  }, [initialAutomations]);

  function loadAutomationIntoForm(auto: InstagramAutomationView) {
    setSelectedAutoId(auto.id);
    setAccountId(auto.instagramAccountId);
    setName(auto.name);
    setTriggerType(auto.triggerType);
    setMatchMode(auto.matchMode);
    setKeywordsText(auto.keywords.join(", "));
    setReplyToComment(auto.replyToComment);
    setCommentRepliesText(auto.commentReplies.join("\n"));
    setRequireFollow(auto.requireFollow);
    setFollowGateMessage(auto.followGateMessage);
    setFollowGateButtonLabel(auto.followGateButtonLabel);
    setNotFollowingMessage(auto.notFollowingMessage);
    setCollectLeadField(auto.collectLeadField);
    setCollectLeadPrompt(auto.collectLeadPrompt);
    setDmMessage(auto.dmMessage);
    setDmButtonTitle(auto.dmButtonTitle);
    setDmButtonUrl(auto.dmButtonUrl);
    setSimFeed([]);
    setSimSessionId(null);
    setSimStage("idle");
  }

  function applyPresetTemplate(tpl: (typeof PRESET_TEMPLATES)[number]) {
    setSelectedAutoId("new");
    setName(tpl.title);
    setTriggerType(tpl.triggerType);
    setMatchMode(tpl.matchMode);
    setKeywordsText(tpl.keywords.join(", "));
    setReplyToComment(tpl.replyToComment);
    setCommentRepliesText(tpl.commentReplies.join("\n"));
    setRequireFollow(tpl.requireFollow);
    setFollowGateMessage(tpl.followGateMessage);
    setFollowGateButtonLabel(tpl.followGateButtonLabel);
    setNotFollowingMessage(tpl.notFollowingMessage);
    setCollectLeadField(tpl.collectLeadField);
    setCollectLeadPrompt(tpl.collectLeadPrompt);
    setDmMessage(tpl.dmMessage);
    setDmButtonTitle(tpl.dmButtonTitle);
    setDmButtonUrl(tpl.dmButtonUrl);
    setSimFeed([]);
    setSimSessionId(null);
    setSimStage("idle");
    setSuccessMsg(`Modelo "${tpl.title}" carregado no editor! Clique em Salvar Automação para ativar.`);
  }

  async function handleSaveAutomation() {
    if (!accountId) {
      setError("Selecione uma conta do Instagram.");
      return;
    }
    setBusySave(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/instagram/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "upsert",
          ...(selectedAutoId !== "new" ? { id: selectedAutoId } : {}),
          instagramAccountId: accountId,
          name,
          triggerType,
          matchMode,
          keywords: keywordsText
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          replyToComment,
          commentReplies: commentRepliesText
            .split("\n")
            .map((c) => c.trim())
            .filter(Boolean),
          requireFollow,
          followGateMessage,
          followGateButtonLabel,
          notFollowingMessage,
          collectLeadField,
          collectLeadPrompt,
          dmMessage,
          dmButtonTitle,
          dmButtonUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        automation?: InstagramAutomationView;
        error?: string;
      };
      if (!res.ok || !data.automation) {
        setError(data.error ?? "Não foi possível salvar a automação.");
        return;
      }
      setSelectedAutoId(data.automation.id);
      setSuccessMsg(`Automação "${data.automation.name}" salva e ATIVA!`);
      router.refresh();
    } finally {
      setBusySave(false);
    }
  }

  async function handleToggleStatus(auto: InstagramAutomationView) {
    const nextStatus = auto.status === "active" ? "paused" : "active";
    await fetch("/api/instagram/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "toggle_status",
        automationId: auto.id,
        status: nextStatus,
      }),
    });
    router.refresh();
  }

  async function handleDeleteAutomation(autoId: string) {
    await fetch("/api/instagram/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "delete",
        automationId: autoId,
      }),
    });
    if (selectedAutoId === autoId) {
      setSelectedAutoId(initialAutomations.find((a) => a.id !== autoId)?.id ?? "new");
    }
    router.refresh();
  }

  async function handleRunSimulation(action: "trigger" | "check_follow" | "submit_lead") {
    const targetAutoId = selectedAutoId !== "new" ? selectedAutoId : initialAutomations[0]?.id;
    if (!targetAutoId) {
      setError("Salve a automação primeiro para testar no simulador.");
      return;
    }
    setBusySim(true);
    setError(null);
    try {
      const inputText =
        action === "submit_lead"
          ? simLeadInput
          : action === "check_follow"
            ? "✅ Já sigo!"
            : simCommentText;

      if (action === "trigger") {
        setSimFeed([{ sender: "user_comment", text: `@${simUsername}: "${simCommentText}"` }]);
      } else {
        setSimFeed((prev) => [...prev, { sender: "user_dm", text: inputText }]);
      }

      const res = await fetch("/api/instagram/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "simulate",
          automationId: targetAutoId,
          igUsername: simUsername,
          inputText,
          isFollowing: simIsFollowing,
          action,
          ...(simSessionId ? { sessionId: simSessionId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SimulationStepResult & { error?: string };
      if (!res.ok || !data.session) {
        setError(data.error ?? "Erro ao simular automação.");
        return;
      }

      setSimSessionId(data.session.id);
      setSimStage(data.session.stage);
      setSimFeed((prev) => [
        ...prev,
        ...data.botMessages.map((m) => ({
          sender: (m.channel === "comment_reply" ? "bot_comment" : "bot_dm") as
            | "bot_comment"
            | "bot_dm",
          text: m.text,
          ...(m.buttonTitle ? { buttonTitle: m.buttonTitle } : {}),
          ...(m.buttonUrl ? { buttonUrl: m.buttonUrl } : {}),
          ...(m.quickReplyLabel ? { quickReplyLabel: m.quickReplyLabel } : {}),
        })),
      ]);
      router.refresh();
    } finally {
      setBusySim(false);
    }
  }

  async function handleSyncRealComments() {
    setBusySync(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/instagram/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "sync_comments",
          ...(accountId ? { instagramAccountId: accountId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        checkedMedia?: number;
        triggeredCount?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Erro ao varrer comentários reais.");
        return;
      }
      setSuccessMsg(
        `Varredura concluída! ${data.checkedMedia ?? 0} Reels/Posts verificados na Meta Graph API e ${data.triggeredCount ?? 0} novo(s) comentário(s) respondido(s) automaticamente.`,
      );
      router.refresh();
    } finally {
      setBusySync(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Cabeçalho + Botão de Varredura de Comentários Reais */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-lg text-white shadow">
              ⚡
            </span>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Mercatta ManyChat — Automações de Instagram
            </h1>
          </div>
          <p className="text-sm text-muted">
            Responda comentários nos Reels automaticamente, envie Direct, <strong>só libere links se o cliente seguir seu perfil</strong> e capture leads no piloto automático.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            disabled={busySync}
            onClick={handleSyncRealComments}
          >
            {busySync ? <Spinner /> : "🔄"} Varrer e Responder Comentários Reais Agora
          </Button>
          <a
            href="/api/instagram/oauth/start?returnTo=/automations"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-4 font-display text-xs font-semibold text-white shadow transition hover:opacity-95"
          >
            🔐 Atualizar Permissões de Direct / Comentários
          </a>
        </div>
      </div>

      {/* Painel de Métricas do Funil */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs text-muted">Gatilhos Acionados</p>
          <p className="mt-1 font-display text-2xl font-bold text-fg">{totals.triggers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Comentários Respondidos</p>
          <p className="mt-1 font-display text-2xl font-bold text-primary">{totals.comments}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Directs (DMs) Enviados</p>
          <p className="mt-1 font-display text-2xl font-bold text-pink-400">{totals.dms}</p>
        </Card>
        <Card className="p-4 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-xs text-emerald-300">Novos Seguidores (Trava)</p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-400">+{totals.followers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Leads (WhatsApp / E-mail)</p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-400">{totals.leads}</p>
        </Card>
      </div>

      {error && <Alert>{error}</Alert>}
      {successMsg && <Alert tone="success">{successMsg}</Alert>}

      {/* Modelos Prontos de 1-Clique */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">
            Modelos Prontos de Alta Conversão (1 Clique)
          </h2>
          <span className="text-xs text-muted">
            Clique em qualquer modelo abaixo para carregar no construtor ou edite suas automações ativas.
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {PRESET_TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              onClick={() => applyPresetTemplate(tpl)}
              className="cursor-pointer rounded-2xl border border-border bg-surface p-4 transition hover:border-primary hover:bg-surface-2/60"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge tone="primary">{tpl.badge}</Badge>
                <span className="text-xs font-medium text-primary">Usar modelo →</span>
              </div>
              <p className="mt-2 font-display text-sm font-semibold text-fg">{tpl.title}</p>
              <p className="mt-1 text-xs text-muted">{tpl.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Lista de Automações Salvas */}
      {initialAutomations.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">
              Suas Automações ({initialAutomations.length})
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => applyPresetTemplate(PRESET_TEMPLATES[0]!)}
            >
              + Nova Automação
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {initialAutomations.map((auto) => {
              const isSelected = selectedAutoId === auto.id;
              return (
                <div
                  key={auto.id}
                  onClick={() => loadAutomationIntoForm(auto)}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border bg-surface hover:bg-surface-2/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={auto.status === "active" ? "success" : "neutral"}>
                          {auto.status === "active" ? "● Ativa" : "Pausada"}
                        </Badge>
                        {auto.requireFollow && (
                          <Badge tone="primary">🔒 Trava de Seguidor</Badge>
                        )}
                        <span className="text-xs text-muted">
                          @{auto.accountUsername || auto.accountName}
                        </span>
                      </div>
                      <p className="mt-1.5 font-display text-sm font-semibold text-fg">
                        {auto.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(auto)}
                        className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-surface"
                      >
                        {auto.status === "active" ? "Pausar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAutomation(auto.id)}
                        className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-muted hover:text-danger"
                        title="Excluir automação"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>
                      Palavras: <strong className="text-fg">{auto.keywords.join(", ") || "Qualquer"}</strong>
                    </span>
                    <span>·</span>
                    <span>{auto.triggersCount} disparos</span>
                    <span>·</span>
                    <span className="text-emerald-300">+{auto.followersGainedCount} seguidores</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Grid Principal: Construtor Visual de Fluxo (7 cols) + Simulador Interativo do Instagram (5 cols) */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Coluna Esquerda (7 cols): Construtor do Funil ManyChat */}
        <Card className="space-y-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="font-display text-lg font-semibold">
                {selectedAutoId === "new" ? "Criar Nova Automação" : "Editar Fluxo da Automação"}
              </h2>
              <p className="text-xs text-muted">
                Configure cada etapa do funil: Gatilho → Resposta no Comentário → Trava de Seguidor → Direct.
              </p>
            </div>
            <Badge tone="primary">Fluxo em 4 Passos</Badge>
          </div>

          {/* Nome e Conta */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-fg">Nome da Automação</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Isca Digital Reels — Comente QUERO"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-fg">Perfil do Instagram</label>
              {accounts.length > 5 && (
                <Input
                  type="search"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Filtrar conta (ex.: grupomercatta)..."
                  className="mb-1 h-8 text-xs"
                />
              )}
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium text-fg"
              >
                {filteredAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    @{acc.username || acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ETAPA 1: GATILHO */}
          <div className="space-y-3 rounded-2xl border border-border bg-surface-2/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Etapa 1 · Gatilho (Quando disparar?)
              </span>
              <Badge tone="neutral">Gatilho</Badge>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "comment", label: "💬 Comentário em Reel/Post" },
                  { id: "dm", label: "📩 Mensagem no Direct" },
                  { id: "any", label: "⚡ Comentário + Direct + Story" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTriggerType(t.id)}
                  className={`rounded-xl border p-2.5 text-xs font-medium transition ${
                    triggerType === t.id
                      ? "border-primary bg-primary/15 text-fg ring-1 ring-primary"
                      : "border-border bg-surface text-muted"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-muted">Regra de comparação</label>
                <select
                  value={matchMode}
                  onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs font-medium text-fg"
                >
                  <option value="contains">Contém a palavra</option>
                  <option value="exact">Palavra exata</option>
                  <option value="any_comment">Qualquer comentário / mensagem</option>
                </select>
              </div>
              {matchMode !== "any_comment" && (
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-muted">
                    Palavras-chave separadas por vírgula (maiúsculas/minúsculas tanto faz)
                  </label>
                  <Input
                    value={keywordsText}
                    onChange={(e) => setKeywordsText(e.target.value)}
                    placeholder="QUERO, EU QUERO, LINK, ACESSO"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ETAPA 2: RESPOSTA PÚBLICA NO COMENTÁRIO */}
          <div className="space-y-3 rounded-2xl border border-border bg-surface-2/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Etapa 2 · Responder o Comentário no Post/Reel
                </span>
                <p className="text-xs text-muted">
                  Dobra o número de comentários no seu Reel e avisa a pessoa para olhar o Direct.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={replyToComment}
                  onChange={(e) => setReplyToComment(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Ativado
              </label>
            </div>

            {replyToComment && (
              <div className="space-y-1">
                <label className="text-xs text-muted">
                  Variações de resposta (1 por linha — o sistema alterna automaticamente para evitar bloqueio)
                </label>
                <textarea
                  rows={3}
                  value={commentRepliesText}
                  onChange={(e) => setCommentRepliesText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface p-3 text-xs text-fg focus:border-primary focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* ETAPA 3: TRAVA DE SEGUIDOR ("SÓ ENTREGAR SE SEGUIR") */}
          <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Etapa 3 · 🔒 Trava de Seguidor ("Só Entregar se Seguir")
                </span>
                <p className="text-xs text-muted">
                  O sistema verifica na API da Meta (<code>is_user_follow_business</code>) se a pessoa segue seu perfil antes de entregar o link!
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-emerald-300">
                <input
                  type="checkbox"
                  checked={requireFollow}
                  onChange={(e) => setRequireFollow(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
                Exigir Seguir
              </label>
            </div>

            {requireFollow && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs text-muted">
                    Mensagem enviada no Direct pedindo para seguir (suporta <code>{"{nome}"}</code> e <code>{"{conta}"}</code>)
                  </label>
                  <textarea
                    rows={3}
                    value={followGateMessage}
                    onChange={(e) => setFollowGateMessage(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface p-3 text-xs text-fg focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted">Texto do Botão de Confirmação</label>
                    <Input
                      value={followGateButtonLabel}
                      onChange={(e) => setFollowGateButtonLabel(e.target.value)}
                      placeholder="✅ Já sigo! Liberar meu acesso"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted">
                      Mensagem se clicar em "Já sigo!" SEM estar seguindo
                    </label>
                    <Input
                      value={notFollowingMessage}
                      onChange={(e) => setNotFollowingMessage(e.target.value)}
                      placeholder="Olhei aqui e você ainda não seguiu {conta} 👀..."
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ETAPA 4: CAPTURA DE LEAD + ENTREGA FINAL NO DIRECT */}
          <div className="space-y-3 rounded-2xl border border-border bg-surface-2/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Etapa 4 · Entrega da Recompensa / Link no Direct
              </span>
              <Badge tone="success">Entrega Final</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted">Pedir contato antes de liberar o link?</label>
                <select
                  value={collectLeadField}
                  onChange={(e) => setCollectLeadField(e.target.value as CollectLeadField)}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs font-medium text-fg"
                >
                  <option value="none">Não — Entregar o link imediatamente após seguir</option>
                  <option value="whatsapp">Sim — Pedir WhatsApp com DDD no Direct</option>
                  <option value="email">Sim — Pedir melhor E-mail no Direct</option>
                </select>
              </div>
              {collectLeadField !== "none" && (
                <div className="space-y-1">
                  <label className="text-xs text-muted">Pergunta para capturar o contato</label>
                  <Input
                    value={collectLeadPrompt}
                    onChange={(e) => setCollectLeadPrompt(e.target.value)}
                    placeholder="Qual é o seu WhatsApp com DDD para eu liberar?"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted">Mensagem Final de Entrega no Direct</label>
              <textarea
                rows={3}
                value={dmMessage}
                onChange={(e) => setDmMessage(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface p-3 text-xs text-fg focus:border-primary focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted">Título do Botão Clicável na DM</label>
                <Input
                  value={dmButtonTitle}
                  onChange={(e) => setDmButtonTitle(e.target.value)}
                  placeholder="Abrir Acesso Exclusivo 🚀"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">Link (URL) de Entrega</label>
                <Input
                  value={dmButtonUrl}
                  onChange={(e) => setDmButtonUrl(e.target.value)}
                  placeholder="https://grupomercatta.com.br/oferta"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={busySave}
            onClick={handleSaveAutomation}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-6 font-display text-sm font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
          >
            {busySave ? <Spinner /> : "💾"} Salvar e Ativar Automação ManyChat
          </button>
        </Card>

        {/* Coluna Direita (5 cols): Simulador em Tempo Real do Instagram */}
        <Card className="flex flex-col justify-between space-y-4 lg:col-span-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-display text-base font-semibold">
                  📱 Simulador ao Vivo do Instagram
                </h3>
                <p className="text-xs text-muted">
                  Teste agora mesmo como o seu cliente vai experimentar o comentário, a trava de seguidor e o Direct!
                </p>
              </div>
              <Badge tone="success">Teste Real</Badge>
            </div>

            {/* Controles do Simulador */}
            <div className="space-y-2.5 rounded-xl border border-border bg-surface-2/40 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted">Usuário simulado</label>
                  <Input
                    value={simUsername}
                    onChange={(e) => setSimUsername(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted">Comentário no Reel</label>
                  <Input
                    value={simCommentText}
                    onChange={(e) => setSimCommentText(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Chave crucial: Simular se o cliente segue ou não! */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-2.5">
                <span className="text-xs font-medium">
                  Status do cliente em relação ao seu perfil:
                </span>
                <button
                  type="button"
                  onClick={() => setSimIsFollowing((v) => !v)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    simIsFollowing
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}
                >
                  {simIsFollowing ? "✅ JÁ SEGUE o perfil" : "❌ AINDA NÃO segue"}
                </button>
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={busySim}
                onClick={() => handleRunSimulation("trigger")}
              >
                {busySim ? <Spinner /> : "▶"} 1. Simular Comentário "{simCommentText}" no Reel
              </Button>
            </div>

            {/* Tela de Chat do Instagram */}
            <div className="min-h-[22rem] max-h-[28rem] space-y-2.5 overflow-y-auto rounded-2xl border border-border bg-black/70 p-4">
              {simFeed.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-muted">
                  <p className="text-sm font-medium text-fg">Pronto para testar!</p>
                  <p className="mt-1 max-w-xs">
                    Clique no botão acima para simular alguém comentando <strong>"{simCommentText}"</strong> no seu Reel e veja a resposta no comentário + Trava de Seguidor no Direct.
                  </p>
                </div>
              ) : (
                simFeed.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-xl p-3 text-xs ${
                      msg.sender === "user_comment"
                        ? "border border-border bg-surface-2/60 text-fg"
                        : msg.sender === "bot_comment"
                          ? "ml-4 border border-primary/40 bg-primary/15 text-fg"
                          : msg.sender === "user_dm"
                            ? "ml-10 bg-primary text-white"
                            : "mr-6 border border-border bg-surface text-fg"
                    }`}
                  >
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-70">
                      {msg.sender === "user_comment"
                        ? "💬 Comentário Público no Reel"
                        : msg.sender === "bot_comment"
                          ? "🤖 Resposta Automática no Comentário"
                          : msg.sender === "user_dm"
                            ? `📩 Direct de @${simUsername}`
                            : "📩 Direct Enviado pelo Mercatta Mix"}
                    </p>
                    <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

                    {msg.quickReplyLabel && (
                      <div className="mt-2.5 pt-1">
                        <button
                          type="button"
                          disabled={busySim}
                          onClick={() => handleRunSimulation("check_follow")}
                          className="w-full rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-2 text-center text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
                        >
                          {msg.quickReplyLabel} (Clicar como cliente)
                        </button>
                      </div>
                    )}

                    {msg.buttonUrl && (
                      <div className="mt-2.5">
                        <a
                          href={msg.buttonUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block w-full rounded-lg bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-3 py-2 text-center text-xs font-semibold text-white"
                        >
                          {msg.buttonTitle || "Abrir Link 🚀"} ↗
                        </a>
                      </div>
                    )}
                  </div>
                ))
              )}

              {simStage === "awaiting_lead_input" && (
                <div className="flex items-center gap-2 pt-2">
                  <Input
                    value={simLeadInput}
                    onChange={(e) => setSimLeadInput(e.target.value)}
                    placeholder="Digite o WhatsApp/E-mail..."
                    className="h-9 text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={busySim}
                    onClick={() => handleRunSimulation("submit_lead")}
                  >
                    Enviar
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Info de Webhook Oficial Meta */}
          <div className="rounded-xl border border-border bg-surface-2/30 p-3 text-xs text-muted space-y-1">
            <p className="font-semibold text-fg">🔗 Webhook em Tempo Real + Varredura Automática Ativa</p>
            <p>
              O Worker já varre automaticamente os comentários dos seus Reels a cada 45s. Para eventos instantâneos via Webhook na Meta, use:
            </p>
            <p className="font-mono text-[11px] text-primary break-all">{webhookUrl}</p>
            <p className="text-[11px]">
              Token de verificação: <code className="text-fg">mercatta_mix_webhook_2026</code>
            </p>
          </div>
        </Card>
      </div>

      {/* CRM de Leads e Histórico de Interações */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h2 className="font-display text-lg font-semibold">
              CRM de Interações, Seguidores e Leads ({initialSessions.length})
            </h2>
            <p className="text-xs text-muted">
              Histórico em tempo real de todas as pessoas que comentaram ou mandaram Direct nas suas automações.
            </p>
          </div>
        </div>

        {initialSessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-2 pr-3">Usuário</th>
                  <th className="py-2 pr-3">Gatilho / Comentário</th>
                  <th className="py-2 pr-3">Segue o Perfil?</th>
                  <th className="py-2 pr-3">Status no Funil</th>
                  <th className="py-2 pr-3">Lead Capturado</th>
                  <th className="py-2">Última Mensagem Enviada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {initialSessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3 font-medium text-fg">
                      @{s.igUsername || s.igSenderId}
                      <span className="block text-[10px] text-muted">
                        → @{s.accountUsername}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge tone="neutral">{s.sourceType}</Badge>{" "}
                      <span className="font-mono">{s.triggerText}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {s.isFollowing ? (
                        <Badge tone="success">✓ Seguidor confirmado</Badge>
                      ) : (
                        <Badge tone="warn">🔒 Aguardando seguir</Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {s.stage === "delivered" ? (
                        <Badge tone="success">Link Entregue ✓</Badge>
                      ) : s.stage === "awaiting_follow" ? (
                        <Badge tone="warn">Na Trava de Seguidor</Badge>
                      ) : s.stage === "awaiting_lead_input" ? (
                        <Badge tone="primary">Aguardando WhatsApp/E-mail</Badge>
                      ) : (
                        <Badge tone="neutral">{s.stage}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-emerald-300">
                      {s.leadWhatsapp || s.leadEmail || "—"}
                    </td>
                    <td className="py-2.5 max-w-xs truncate text-muted" title={s.dmSent ?? ""}>
                      {s.dmSent || s.commentReplySent || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-muted">
            Nenhuma interação registrada ainda. Use o Simulador acima ou clique em "Varrer e Responder Comentários Reais Agora".
          </p>
        )}
      </Card>
    </div>
  );
}
