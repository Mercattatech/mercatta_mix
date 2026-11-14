"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Alert, Badge, Button, Input, Spinner } from "@/components/ui";

type NodeId =
  | "trigger"
  | "comment_reply"
  | "follow_gate"
  | "not_following"
  | "lead_capture"
  | "dm_delivery";

interface NodePos {
  x: number;
  y: number;
}

interface FlowEdge {
  id: string;
  from: NodeId;
  fromPort: "out" | "yes" | "no";
  to: NodeId;
  color: string;
  label?: string;
}

const NODE_WIDTH = 290;

const DEFAULT_POSITIONS: Record<NodeId, NodePos> = {
  trigger: { x: 60, y: 180 },
  comment_reply: { x: 420, y: 40 },
  follow_gate: { x: 420, y: 260 },
  not_following: { x: 800, y: 430 },
  lead_capture: { x: 800, y: 180 },
  dm_delivery: { x: 1170, y: 180 },
};

const PRESET_TEMPLATES = [
  {
    id: "reel_lead_magnet",
    badge: "🔥 Isca Digital (QUERO)",
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
    badge: "📲 Captura WhatsApp",
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
    keywords: ["OFERTA", "CUPOM", "DESCONTO", "CATALOGO"],
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

  // Dados do Fluxo
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
  const [newKeywordInput, setNewKeywordInput] = useState<string>("");
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

  // Estado do Canvas de Tela Cheia + Gaveta Lateral
  const [nodePositions, setNodePositions] = useState<Record<NodeId, NodePos>>(DEFAULT_POSITIONS);
  const [selectedNode, setSelectedNode] = useState<NodeId | null>("follow_gate");
  const [drawerMode, setDrawerMode] = useState<"closed" | "inspector" | "simulator" | "crm">("inspector");
  const [zoom, setZoom] = useState<number>(0.88);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 24, y: 24 });

  // Refs para Drag & Drop com listener global em `window` (nunca gruda o mouse!)
  const dragStateRef = useRef<{
    mode: "node" | "pan";
    nodeId?: NodeId;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
  } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    function onWindowPointerMove(e: PointerEvent) {
      const st = dragStateRef.current;
      if (!st) return;
      const dxScreen = e.clientX - st.startClientX;
      const dyScreen = e.clientY - st.startClientY;
      if (!st.hasMoved && Math.hypot(dxScreen, dyScreen) < 5) {
        return; // Clique simples sem arrastar: não move a caixinha
      }
      st.hasMoved = true;

      if (st.mode === "node" && st.nodeId) {
        const z = zoomRef.current || 1;
        const nextX = Math.max(16, Math.round(st.origX + dxScreen / z));
        const nextY = Math.max(16, Math.round(st.origY + dyScreen / z));
        const id = st.nodeId;
        setNodePositions((prev) => ({
          ...prev,
          [id]: { x: nextX, y: nextY },
        }));
      } else if (st.mode === "pan") {
        setPan({
          x: Math.round(st.origX + dxScreen),
          y: Math.round(st.origY + dyScreen),
        });
      }
    }

    function onWindowPointerUp() {
      dragStateRef.current = null;
    }

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
    window.addEventListener("blur", onWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
      window.removeEventListener("blur", onWindowPointerUp);
    };
  }, []);

  // Estado do Simulador Interativo do Instagram
  const [simUsername, setSimUsername] = useState<string>("cliente.interessado");
  const [simCommentText, setSimCommentText] = useState<string>("EU QUERO");
  const [simIsFollowing, setSimIsFollowing] = useState<boolean>(false);
  const [simLeadInput, setSimLeadInput] = useState<string>("11998887766");
  const [simSessionId, setSimSessionId] = useState<string | null>(null);
  const [simStage, setSimStage] = useState<string>("idle");
  const [activeSimNodes, setActiveSimNodes] = useState<NodeId[]>([]);
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

  const selectedAccountObj = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? defaultAcc,
    [accounts, accountId, defaultAcc],
  );

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

  const parsedKeywords = useMemo(
    () =>
      keywordsText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordsText],
  );

  const parsedCommentReplies = useMemo(
    () =>
      commentRepliesText
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean),
    [commentRepliesText],
  );

  // Calcula os conectores curvos entre as caixinhas
  const edges = useMemo<FlowEdge[]>(() => {
    const list: FlowEdge[] = [];
    const nextAfterTrigger: NodeId = requireFollow
      ? "follow_gate"
      : collectLeadField !== "none"
        ? "lead_capture"
        : "dm_delivery";

    if (replyToComment) {
      list.push({
        id: "e-trigger-comment",
        from: "trigger",
        fromPort: "out",
        to: "comment_reply",
        color: "#ec4899",
        label: "1º Responde no Reel",
      });
      list.push({
        id: "e-comment-next",
        from: "comment_reply",
        fromPort: "out",
        to: nextAfterTrigger,
        color: "#818cf8",
        label: "Chama no Direct",
      });
    } else {
      list.push({
        id: "e-trigger-direct",
        from: "trigger",
        fromPort: "out",
        to: nextAfterTrigger,
        color: "#ec4899",
        label: "Envia Direct",
      });
    }

    if (requireFollow) {
      const targetIfFollows: NodeId = collectLeadField !== "none" ? "lead_capture" : "dm_delivery";
      list.push({
        id: "e-follow-yes",
        from: "follow_gate",
        fromPort: "yes",
        to: targetIfFollows,
        color: "#10b981",
        label: "✓ SIM, Já Segue",
      });
      list.push({
        id: "e-follow-no",
        from: "follow_gate",
        fromPort: "no",
        to: "not_following",
        color: "#f59e0b",
        label: "✕ NÃO Segue",
      });
    }

    if (collectLeadField !== "none") {
      list.push({
        id: "e-lead-delivery",
        from: "lead_capture",
        fromPort: "out",
        to: "dm_delivery",
        color: "#06b6d4",
        label: "Contato Salvo",
      });
    }

    return list;
  }, [replyToComment, requireFollow, collectLeadField]);

  function getPortCoords(nodeId: NodeId, port: "in" | "out" | "yes" | "no"): { x: number; y: number } {
    const pos = nodePositions[nodeId];
    if (port === "in") {
      return { x: pos.x, y: pos.y + 68 };
    }
    if (nodeId === "follow_gate") {
      if (port === "yes") return { x: pos.x + NODE_WIDTH, y: pos.y + 64 };
      if (port === "no") return { x: pos.x + NODE_WIDTH, y: pos.y + 132 };
    }
    return { x: pos.x + NODE_WIDTH, y: pos.y + 68 };
  }

  function makeBezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(70, Math.abs(x2 - x1) * 0.48);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  function startDraggingNode(e: React.PointerEvent, id: NodeId) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedNode(id);
    setDrawerMode("inspector");
    const pos = nodePositions[id];
    dragStateRef.current = {
      mode: "node",
      nodeId: id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      hasMoved: false,
    };
  }

  function startPanningCanvas(e: React.PointerEvent) {
    if (e.button !== 0) return;
    dragStateRef.current = {
      mode: "pan",
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: pan.x,
      origY: pan.y,
      hasMoved: false,
    };
  }

  function autoArrangeLayout() {
    const hasLead = collectLeadField !== "none";
    setNodePositions({
      trigger: { x: 40, y: 170 },
      comment_reply: { x: 390, y: 30 },
      follow_gate: { x: 390, y: 240 },
      not_following: { x: 760, y: 410 },
      lead_capture: { x: 760, y: 170 },
      dm_delivery: { x: hasLead ? 1120 : 760, y: 170 },
    });
    setZoom(hasLead ? 0.82 : 0.92);
    setPan({ x: 24, y: 24 });
  }

  function addKeywordChip() {
    const kw = newKeywordInput.trim().toUpperCase();
    if (!kw) return;
    const next = Array.from(new Set([...parsedKeywords, kw]));
    setKeywordsText(next.join(", "));
    setNewKeywordInput("");
  }

  function removeKeywordChip(kwToRemove: string) {
    const next = parsedKeywords.filter((k) => k !== kwToRemove);
    setKeywordsText(next.join(", "));
  }

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
    setActiveSimNodes([]);
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
    setActiveSimNodes([]);
    setSuccessMsg(`Modelo "${tpl.badge}" carregado! Clique em Salvar e Publicar Fluxo no topo direito.`);
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
          keywords: parsedKeywords,
          replyToComment,
          commentReplies: parsedCommentReplies,
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
      setSuccessMsg(`Fluxo "${data.automation.name}" salvo e ativo!`);
      router.refresh();
    } finally {
      setBusySave(false);
    }
  }

  async function handleRunSimulation(action: "trigger" | "check_follow" | "submit_lead") {
    const targetAutoId = selectedAutoId !== "new" ? selectedAutoId : initialAutomations[0]?.id;
    if (!targetAutoId) {
      setError("Salve o fluxo primeiro para testar no simulador.");
      return;
    }
    setBusySim(true);
    setError(null);
    setDrawerMode("simulator");
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

      if (action === "trigger") {
        const hit: NodeId[] = ["trigger"];
        if (replyToComment) hit.push("comment_reply");
        if (data.session.stage === "awaiting_follow") hit.push("follow_gate");
        else if (data.session.stage === "awaiting_lead_input") hit.push("follow_gate", "lead_capture");
        else hit.push("dm_delivery");
        setActiveSimNodes(hit);
      } else if (action === "check_follow") {
        if (!simIsFollowing) {
          setActiveSimNodes(["follow_gate", "not_following"]);
        } else if (data.session.stage === "awaiting_lead_input") {
          setActiveSimNodes(["follow_gate", "lead_capture"]);
        } else {
          setActiveSimNodes(["follow_gate", "dm_delivery"]);
        }
      } else {
        setActiveSimNodes(["lead_capture", "dm_delivery"]);
      }

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
        `Varredura concluída: ${data.checkedMedia ?? 0} Reels verificados e ${data.triggeredCount ?? 0} novo(s) comentário(s) respondido(s)!`,
      );
      router.refresh();
    } finally {
      setBusySync(false);
    }
  }

  return (
    /* WORKSPACE DE TELA CHEIA (OCUPA 100% DA JANELA ABAIXO DO TOPBAR) */
    <div className="fixed inset-x-0 bottom-0 top-16 z-20 flex flex-col bg-[#08090d] text-white">
      {/* BARRA DE COMANDO SUPERIOR DO STUDIO (ESTILO MANYCHAT / FIGMA) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#10121a] px-5 py-2.5">
        {/* Esquerda: Seletor de Fluxo + Conta do Instagram */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-sm font-bold text-white shadow">
              ⚡
            </span>
            <select
              value={selectedAutoId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "new") {
                  applyPresetTemplate(PRESET_TEMPLATES[0]!);
                } else {
                  const found = initialAutomations.find((a) => a.id === val);
                  if (found) loadAutomationIntoForm(found);
                }
              }}
              className="h-9 max-w-[18rem] rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs font-semibold text-white"
            >
              {initialAutomations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.status === "active" ? "🟢 " : "⏸️ "}
                  {a.name}
                </option>
              ))}
              <option value="new">➕ Criar Novo Fluxo...</option>
            </select>
          </div>

          {/* Seletor rápido da @conta */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#181b26] px-2.5 py-1">
            <span className="text-[11px] text-zinc-400">Perfil:</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-pink-300 focus:outline-none"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-[#181b26] text-white">
                  @{acc.username || acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Modelos Prontos em 1 clique */}
          <div className="hidden xl:flex items-center gap-1.5 border-l border-white/10 pl-3">
            <span className="text-[11px] text-zinc-400">Modelos:</span>
            {PRESET_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyPresetTemplate(tpl)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:border-pink-500/50 hover:bg-pink-500/10"
              >
                {tpl.badge}
              </button>
            ))}
          </div>
        </div>

        {/* Direita: Métricas + Simulador + CRM + Publicar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden md:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px]">
            <span>
              Disparos: <strong className="text-white">{totals.triggers}</strong>
            </span>
            <span className="text-white/20">|</span>
            <span>
              DMs: <strong className="text-pink-300">{totals.dms}</strong>
            </span>
            <span className="text-white/20">|</span>
            <span>
              Seguidores: <strong className="text-emerald-400">+{totals.followers}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setDrawerMode(drawerMode === "crm" ? "closed" : "crm")}
            className={`h-9 rounded-xl border px-3 text-xs font-semibold transition ${
              drawerMode === "crm"
                ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                : "border-white/15 bg-[#181b26] text-zinc-200 hover:bg-white/10"
            }`}
          >
            👥 Leads & CRM ({initialSessions.length})
          </button>

          <button
            type="button"
            onClick={() => setDrawerMode(drawerMode === "simulator" ? "closed" : "simulator")}
            className={`h-9 rounded-xl border px-3.5 text-xs font-semibold transition ${
              drawerMode === "simulator"
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            }`}
          >
            📱 Testar Fluxo ao Vivo
          </button>

          <button
            type="button"
            disabled={busySync}
            onClick={handleSyncRealComments}
            className="h-9 rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
            title="Busca novos comentários nos seus Reels publicados e responde agora"
          >
            {busySync ? "Sincronizando..." : "🔄 Varrer Comentários"}
          </button>

          <button
            type="button"
            disabled={busySave}
            onClick={handleSaveAutomation}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-4 font-display text-xs font-bold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
          >
            {busySave ? <Spinner /> : "💾"} Salvar e Publicar Fluxo
          </button>
        </div>
      </div>

      {/* Alertas flutuantes */}
      {(error || successMsg) && (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 max-w-xl w-full px-4">
          {error && <Alert>{error}</Alert>}
          {successMsg && <Alert tone="success">{successMsg}</Alert>}
        </div>
      )}

      {/* CORPO PRINCIPAL: CANVAS 100% TELA CHEIA + GAVETA LATERAL RETRÁTIL */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* BARRA FLUTUANTE NO TOPO ESQUERDO DO CANVAS: ADICIONAR/ATIVAR BLOCOS + AUTO-ORGANIZAR */}
        <div className=" absolute left-4 top-4 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-[#12141f]/95 p-2 shadow-2xl backdrop-blur">
          <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Etapas do Fluxo:
          </span>
          <button
            type="button"
            onClick={() => {
              setReplyToComment((v) => !v);
              setSelectedNode("comment_reply");
              setDrawerMode("inspector");
            }}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              replyToComment
                ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-200"
                : "border-white/10 bg-white/5 text-zinc-400"
            }`}
          >
            {replyToComment ? "✓" : "+"} 💬 Responder Comentário
          </button>
          <button
            type="button"
            onClick={() => {
              setRequireFollow((v) => !v);
              setSelectedNode("follow_gate");
              setDrawerMode("inspector");
            }}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              requireFollow
                ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                : "border-white/10 bg-white/5 text-zinc-400"
            }`}
          >
            {requireFollow ? "✓" : "+"} 🔒 Trava "Só Entrega se Seguir"
          </button>
          <button
            type="button"
            onClick={() => {
              const next = collectLeadField === "none" ? "whatsapp" : "none";
              setCollectLeadField(next);
              setSelectedNode("lead_capture");
              setDrawerMode("inspector");
            }}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              collectLeadField !== "none"
                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
                : "border-white/10 bg-white/5 text-zinc-400"
            }`}
          >
            {collectLeadField !== "none" ? "✓" : "+"} 📲 Capturar WhatsApp/E-mail
          </button>

          <div className="h-5 w-px bg-white/10 mx-1" />

          <button
            type="button"
            onClick={autoArrangeLayout}
            className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            ✨ Auto-Organizar Tela
          </button>
        </div>

        {/* CONTROLES DE ZOOM NO RODAPÉ ESQUERDO DO CANVAS */}
        <div className="absolute bottom-4 left-4 z-30 flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#12141f]/95 p-1.5 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
            className="h-8 w-8 rounded-lg bg-white/5 text-sm font-bold hover:bg-white/15"
          >
            −
          </button>
          <span className="min-w-[3.5rem] text-center font-mono text-xs font-semibold text-zinc-200">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.3, Number((z + 0.1).toFixed(2))))}
            className="h-8 w-8 rounded-lg bg-white/5 text-sm font-bold hover:bg-white/15"
          >
            +
          </button>
          <button
            type="button"
            onClick={autoArrangeLayout}
            className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/15"
          >
            Ajustar à Tela
          </button>
        </div>

        {/* CANVAS INFINITO DE TELA CHEIA */}
        <div
          onPointerDown={startPanningCanvas}
          className="relative flex-1 cursor-grab select-none overflow-hidden active:cursor-grabbing"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.13) 1px, transparent 1px)",
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              width: 1600,
              height: 900,
            }}
            className="relative"
          >
            {/* CONECTORES CURVOS SVG */}
            <svg
              width={1600}
              height={900}
              className="pointer-events-none absolute inset-0 overflow-visible"
            >
              {edges.map((edge) => {
                const start = getPortCoords(edge.from, edge.fromPort);
                const end = getPortCoords(edge.to, "in");
                const pathD = makeBezierPath(start.x, start.y, end.x, end.y);
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2 - 12;
                const isSimActive =
                  activeSimNodes.includes(edge.from) && activeSimNodes.includes(edge.to);

                return (
                  <g key={edge.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={edge.color}
                      strokeOpacity={isSimActive ? 0.45 : 0.2}
                      strokeWidth={isSimActive ? 9 : 6}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={edge.color}
                      strokeWidth={2.5}
                      strokeDasharray="7 5"
                    />
                    <circle cx={start.x} cy={start.y} r={5} fill={edge.color} />
                    <circle cx={end.x} cy={end.y} r={6} fill={edge.color} />
                    {edge.label && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x={-68}
                          y={-11}
                          width={136}
                          height={22}
                          rx={8}
                          fill="#11131c"
                          stroke={edge.color}
                          strokeOpacity={0.6}
                          strokeWidth={1.2}
                        />
                        <text
                          x={0}
                          y={4}
                          textAnchor="middle"
                          fill="#f4f4f5"
                          fontSize={11}
                          fontWeight={600}
                        >
                          {edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* BLOCO 1: GATILHO INICIAL */}
            <div
              onPointerDown={(e) => startDraggingNode(e, "trigger")}
              style={{
                left: nodePositions.trigger.x,
                top: nodePositions.trigger.y,
                width: NODE_WIDTH,
              }}
              className={`absolute rounded-2xl border bg-[#141724] p-4 shadow-2xl transition-colors ${
                selectedNode === "trigger" && drawerMode === "inspector"
                  ? "border-pink-500 ring-2 ring-pink-500/40"
                  : "border-white/15 hover:border-pink-500/60"
              } ${activeSimNodes.includes("trigger") ? "ring-4 ring-emerald-400" : ""}`}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-xs font-bold">
                    ⚡
                  </span>
                  <div>
                    <p className="font-display text-xs font-bold text-white">1. Quando o Cliente</p>
                    <p className="text-[10px] text-zinc-400">Gatilho do Instagram</p>
                  </div>
                </div>
                <span className="rounded-md bg-pink-500/20 px-2 py-0.5 text-[10px] font-bold text-pink-300">
                  Início
                </span>
              </div>

              <div className="mt-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between rounded-lg bg-black/40 px-2.5 py-1.5">
                  <span className="text-zinc-400">Conta:</span>
                  <strong className="text-pink-300">
                    @{selectedAccountObj?.username || "grupomercatta"}
                  </strong>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 text-zinc-200 font-medium">
                  {triggerType === "comment"
                    ? "💬 Comentar em qualquer Reel ou Post"
                    : triggerType === "dm"
                      ? "📩 Enviar Mensagem no Direct (DM)"
                      : "⚡ Comentar no Reel, Direct ou Story"}
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Palavras que ativam:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {matchMode === "any_comment" ? (
                      <span className="rounded-lg bg-pink-500/20 px-2.5 py-1 text-[11px] font-semibold text-pink-200">
                        Qualquer comentário
                      </span>
                    ) : (
                      parsedKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded-lg border border-pink-500/40 bg-pink-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-pink-200"
                        >
                          {kw}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setSelectedNode("trigger");
                    setDrawerMode("inspector");
                  }}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 py-1.5 text-center text-[11px] font-semibold text-zinc-200 transition hover:bg-pink-500/20 hover:border-pink-500/40"
                >
                  ✏️ Editar Palavras e Gatilho
                </button>
              </div>
            </div>

            {/* BLOCO 2: RESPOSTA PÚBLICA NO COMENTÁRIO */}
            {replyToComment && (
              <div
                onPointerDown={(e) => startDraggingNode(e, "comment_reply")}
                style={{
                  left: nodePositions.comment_reply.x,
                  top: nodePositions.comment_reply.y,
                  width: NODE_WIDTH,
                }}
                className={`absolute rounded-2xl border bg-[#141724] p-4 shadow-2xl transition-colors ${
                  selectedNode === "comment_reply" && drawerMode === "inspector"
                    ? "border-indigo-400 ring-2 ring-indigo-500/40"
                    : "border-white/15 hover:border-indigo-400/60"
                } ${activeSimNodes.includes("comment_reply") ? "ring-4 ring-emerald-400" : ""}`}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/25 text-xs">
                      💬
                    </span>
                    <div>
                      <p className="font-display text-xs font-bold text-white">
                        Responder no Comentário
                      </p>
                      <p className="text-[10px] text-zinc-400">Resposta pública no Reel</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                    {parsedCommentReplies.length} frases
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 text-zinc-200 italic">
                    "{parsedCommentReplies[0] || "Acabei de te enviar no Direct! 🔥"}"
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      setSelectedNode("comment_reply");
                      setDrawerMode("inspector");
                    }}
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-1.5 text-center text-[11px] font-semibold text-zinc-200 transition hover:bg-indigo-500/20 hover:border-indigo-400/40"
                  >
                    ✏️ Editar Frases de Resposta
                  </button>
                </div>
              </div>
            )}

            {/* BLOCO 3: TRAVA DE SEGUIDOR ("SÓ ENTREGAR SE SEGUIR") */}
            {requireFollow && (
              <div
                onPointerDown={(e) => startDraggingNode(e, "follow_gate")}
                style={{
                  left: nodePositions.follow_gate.x,
                  top: nodePositions.follow_gate.y,
                  width: NODE_WIDTH,
                }}
                className={`absolute rounded-2xl border bg-[#141724] p-4 shadow-2xl transition-colors ${
                  selectedNode === "follow_gate" && drawerMode === "inspector"
                    ? "border-emerald-400 ring-2 ring-emerald-500/40"
                    : "border-emerald-500/35 hover:border-emerald-400"
                } ${activeSimNodes.includes("follow_gate") ? "ring-4 ring-emerald-400" : ""}`}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/25 text-xs">
                      🔒
                    </span>
                    <div>
                      <p className="font-display text-xs font-bold text-white">
                        Trava de Seguidor
                      </p>
                      <p className="text-[10px] text-emerald-300">Só libera o link se seguir</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    Verificador
                  </span>
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 text-zinc-200 line-clamp-3 leading-relaxed">
                    {followGateMessage}
                  </div>
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-center text-[11px] font-bold text-emerald-200">
                    {followGateButtonLabel}
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      setSelectedNode("follow_gate");
                      setDrawerMode("inspector");
                    }}
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-1.5 text-center text-[11px] font-semibold text-zinc-200 transition hover:bg-emerald-500/20 hover:border-emerald-400/40"
                  >
                    ✏️ Editar Mensagem da Trava
                  </button>
                </div>
              </div>
            )}

            {/* BLOCO 3B: SE NÃO ESTIVER SEGUINDO */}
            {requireFollow && (
              <div
                onPointerDown={(e) => startDraggingNode(e, "not_following")}
                style={{
                  left: nodePositions.not_following.x,
                  top: nodePositions.not_following.y,
                  width: NODE_WIDTH,
                }}
                className={`absolute rounded-2xl border bg-[#141724] p-4 shadow-2xl transition-colors ${
                  selectedNode === "not_following" && drawerMode === "inspector"
                    ? "border-amber-400 ring-2 ring-amber-500/40"
                    : "border-amber-500/35 hover:border-amber-400"
                } ${activeSimNodes.includes("not_following") ? "ring-4 ring-amber-400" : ""}`}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/25 text-xs">
                      👀
                    </span>
                    <div>
                      <p className="font-display text-xs font-bold text-white">
                        Aviso: Ainda Não Segue
                      </p>
                      <p className="text-[10px] text-amber-300">Se clicar sem ter seguido</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 text-zinc-200 line-clamp-3 leading-relaxed">
                    {notFollowingMessage}
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      setSelectedNode("not_following");
                      setDrawerMode("inspector");
                    }}
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-1.5 text-center text-[11px] font-semibold text-zinc-200 transition hover:bg-amber-500/20 hover:border-amber-400/40"
                  >
                    ✏️ Editar Aviso de Não Seguidor
                  </button>
                </div>
              </div>
            )}

            {/* BLOCO 4: CAPTURA DE LEAD (WHATSAPP / E-MAIL) */}
            {collectLeadField !== "none" && (
              <div
                onPointerDown={(e) => startDraggingNode(e, "lead_capture")}
                style={{
                  left: nodePositions.lead_capture.x,
                  top: nodePositions.lead_capture.y,
                  width: NODE_WIDTH,
                }}
                className={`absolute rounded-2xl border bg-[#141724] p-4 shadow-2xl transition-colors ${
                  selectedNode === "lead_capture" && drawerMode === "inspector"
                    ? "border-cyan-400 ring-2 ring-cyan-500/40"
                    : "border-cyan-500/35 hover:border-cyan-400"
                } ${activeSimNodes.includes("lead_capture") ? "ring-4 ring-emerald-400" : ""}`}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/25 text-xs">
                      📲
                    </span>
                    <div>
                      <p className="font-display text-xs font-bold text-white">
                        Pedir {collectLeadField === "whatsapp" ? "WhatsApp" : "E-mail"}
                      </p>
                      <p className="text-[10px] text-cyan-300">Salva contato no CRM</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 text-zinc-200 line-clamp-3">
                    {collectLeadPrompt || "Me digita seu WhatsApp com DDD para liberar:"}
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      setSelectedNode("lead_capture");
                      setDrawerMode("inspector");
                    }}
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-1.5 text-center text-[11px] font-semibold text-zinc-200 transition hover:bg-cyan-500/20"
                  >
                    ✏️ Editar Captura de Lead
                  </button>
                </div>
              </div>
            )}

            {/* BLOCO 5: ENTREGA FINAL NO DIRECT */}
            <div
              onPointerDown={(e) => startDraggingNode(e, "dm_delivery")}
              style={{
                left: nodePositions.dm_delivery.x,
                top: nodePositions.dm_delivery.y,
                width: NODE_WIDTH,
              }}
              className={`absolute rounded-2xl border bg-[#141724] p-4 shadow-2xl transition-colors ${
                selectedNode === "dm_delivery" && drawerMode === "inspector"
                  ? "border-purple-400 ring-2 ring-purple-500/40"
                  : "border-purple-500/35 hover:border-purple-400"
              } ${activeSimNodes.includes("dm_delivery") ? "ring-4 ring-emerald-400" : ""}`}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/25 text-xs">
                    🎁
                  </span>
                  <div>
                    <p className="font-display text-xs font-bold text-white">
                      Entrega Final no Direct
                    </p>
                    <p className="text-[10px] text-purple-300">Mensagem + Botão com Link</p>
                  </div>
                </div>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  Entrega
                </span>
              </div>

              <div className="mt-3 space-y-2.5 text-xs">
                <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 text-zinc-200 line-clamp-3 leading-relaxed">
                  {dmMessage}
                </div>
                {dmButtonUrl && (
                  <div className="rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-3 py-2 text-center text-xs font-bold text-white shadow">
                    🔗 {dmButtonTitle || "Acessar Agora"}
                  </div>
                )}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setSelectedNode("dm_delivery");
                    setDrawerMode("inspector");
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-1.5 text-center text-[11px] font-semibold text-zinc-200 transition hover:bg-purple-500/20"
                >
                  ✏️ Editar Mensagem e Link Final
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* GAVETA LATERAL DIREITA (INSPECTOR / SIMULADOR / CRM) — PODE SER FECHADA P/ TELA 100% LIVRE */}
        {drawerMode !== "closed" && (
          <aside className="z-30 flex w-full max-w-[27rem] flex-col justify-between border-l border-white/10 bg-[#11131d] p-5 shadow-2xl overflow-y-auto">
            <div className="space-y-5">
              {/* Cabeçalho da Gaveta com Botão Fechar */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDrawerMode("inspector")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      drawerMode === "inspector"
                        ? "bg-pink-500 text-white"
                        : "bg-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    ⚙️ Editar Bloco
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerMode("simulator")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      drawerMode === "simulator"
                        ? "bg-emerald-500 text-white"
                        : "bg-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    📱 Simulador
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerMode("crm")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      drawerMode === "crm"
                        ? "bg-cyan-500 text-white"
                        : "bg-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    👥 CRM ({initialSessions.length})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerMode("closed")}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
                  title="Fechar painel lateral para ver o Canvas em tela cheia"
                >
                  ✕ Fechar
                </button>
              </div>

              {/* MODO 1: INSPETOR DE BLOCO */}
              {drawerMode === "inspector" && (
                <div className="space-y-4">
                  {/* Seletor rápido de qual bloco está sendo editado */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: "trigger", label: "⚡ 1. Gatilho" },
                        { id: "comment_reply", label: "💬 2. Comentário" },
                        { id: "follow_gate", label: "🔒 3. Trava" },
                        { id: "not_following", label: "👀 3B. Não Segue" },
                        { id: "lead_capture", label: "📲 4. Lead" },
                        { id: "dm_delivery", label: "🎁 5. Entrega" },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedNode(item.id)}
                        className={`rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                          selectedNode === item.id
                            ? "border-pink-500 bg-pink-500/20 text-white"
                            : "border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {/* Nome da Automação */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-300">
                      Nome desta Automação
                    </label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>

                  {/* EDIÇÃO DO BLOCO 1: GATILHO */}
                  {selectedNode === "trigger" && (
                    <div className="space-y-4 rounded-2xl border border-pink-500/30 bg-pink-500/5 p-4">
                      <h3 className="font-display text-base font-bold text-pink-300">
                        ⚡ 1. Configurar Gatilho Inicial
                      </h3>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-300">
                          Qual ação do cliente dispara o fluxo?
                        </label>
                        <select
                          value={triggerType}
                          onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                          className="h-10 w-full rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs font-semibold text-white"
                        >
                          <option value="comment">💬 Comentário em um Reel ou Post</option>
                          <option value="dm">📩 Mensagem enviada no Direct (DM)</option>
                          <option value="any">⚡ Ambos (Comentário + Direct + Story)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-300">
                          Quais comentários devem disparar?
                        </label>
                        <select
                          value={matchMode}
                          onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                          className="h-10 w-full rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs font-semibold text-white"
                        >
                          <option value="contains">
                            Quando o comentário contiver uma palavra-chave
                          </option>
                          <option value="exact">Quando for exatamente a palavra-chave</option>
                          <option value="any_comment">
                            Qualquer comentário (responde todo mundo)
                          </option>
                        </select>
                      </div>

                      {matchMode !== "any_comment" && (
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-zinc-300">
                            Palavras-chave ativas (clique no × para remover):
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {parsedKeywords.map((kw) => (
                              <span
                                key={kw}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-pink-500/40 bg-pink-500/20 px-2.5 py-1 font-mono text-xs font-bold text-pink-200"
                              >
                                {kw}
                                <button
                                  type="button"
                                  onClick={() => removeKeywordChip(kw)}
                                  className="text-pink-300 hover:text-white"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Input
                              value={newKeywordInput}
                              onChange={(e) => setNewKeywordInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addKeywordChip();
                                }
                              }}
                              placeholder="Nova palavra (ex.: PLANILHA)"
                            />
                            <Button type="button" variant="outline" onClick={addKeywordChip}>
                              + Adicionar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* EDIÇÃO DO BLOCO 2: RESPOSTA NO COMENTÁRIO */}
                  {selectedNode === "comment_reply" && (
                    <div className="space-y-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-base font-bold text-indigo-300">
                          💬 2. Resposta Pública no Comentário
                        </h3>
                        <label className="inline-flex items-center gap-2 text-xs font-bold text-indigo-200">
                          <input
                            type="checkbox"
                            checked={replyToComment}
                            onChange={(e) => setReplyToComment(e.target.checked)}
                            className="h-4 w-4 accent-indigo-500"
                          />
                          Ativado
                        </label>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Escreva <strong>uma opção de resposta por linha</strong>. O sistema alterna entre elas automaticamente para engajar o Reel e avisar que chamou no Direct:
                      </p>
                      <textarea
                        rows={5}
                        value={commentRepliesText}
                        onChange={(e) => setCommentRepliesText(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-[#181b26] p-3 text-xs text-white focus:border-indigo-400 focus:outline-none leading-relaxed"
                      />
                    </div>
                  )}

                  {/* EDIÇÃO DO BLOCO 3: TRAVA DE SEGUIDOR */}
                  {selectedNode === "follow_gate" && (
                    <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-base font-bold text-emerald-300">
                          🔒 3. Trava "Só Entregar se Seguir"
                        </h3>
                        <label className="inline-flex items-center gap-2 text-xs font-bold text-emerald-300">
                          <input
                            type="checkbox"
                            checked={requireFollow}
                            onChange={(e) => setRequireFollow(e.target.checked)}
                            className="h-4 w-4 accent-emerald-500"
                          />
                          Exigir Seguir
                        </label>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-300">
                          Mensagem enviada no Direct pedindo para seguir (use{" "}
                          <code>{"{nome}"}</code> e <code>{"{conta}"}</code>):
                        </label>
                        <textarea
                          rows={5}
                          value={followGateMessage}
                          onChange={(e) => setFollowGateMessage(e.target.value)}
                          className="w-full rounded-xl border border-white/15 bg-[#181b26] p-3 text-xs text-white focus:border-emerald-400 focus:outline-none leading-relaxed"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-300">
                          Texto do Botão que o cliente clica após seguir:
                        </label>
                        <Input
                          value={followGateButtonLabel}
                          onChange={(e) => setFollowGateButtonLabel(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* EDIÇÃO DO BLOCO 3B: AINDA NÃO SEGUE */}
                  {selectedNode === "not_following" && (
                    <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <h3 className="font-display text-base font-bold text-amber-300">
                        👀 3B. Mensagem "Ainda Não Segue"
                      </h3>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Se a pessoa clicar em <strong>"{followGateButtonLabel}"</strong> sem ter seguido seu perfil, o Mix verifica na Meta e responde com este aviso:
                      </p>
                      <textarea
                        rows={5}
                        value={notFollowingMessage}
                        onChange={(e) => setNotFollowingMessage(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-[#181b26] p-3 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
                      />
                    </div>
                  )}

                  {/* EDIÇÃO DO BLOCO 4: CAPTURA DE LEAD */}
                  {selectedNode === "lead_capture" && (
                    <div className="space-y-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                      <h3 className="font-display text-base font-bold text-cyan-300">
                        📲 4. Capturar WhatsApp ou E-mail
                      </h3>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-300">
                          Solicitar contato antes da entrega final?
                        </label>
                        <select
                          value={collectLeadField}
                          onChange={(e) => setCollectLeadField(e.target.value as CollectLeadField)}
                          className="h-10 w-full rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs font-semibold text-white"
                        >
                          <option value="none">
                            Não — Liberar o link imediatamente após seguir
                          </option>
                          <option value="whatsapp">Sim — Pedir WhatsApp com DDD</option>
                          <option value="email">Sim — Pedir melhor E-mail</option>
                        </select>
                      </div>
                      {collectLeadField !== "none" && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-zinc-300">
                            Mensagem pedindo o contato:
                          </label>
                          <textarea
                            rows={4}
                            value={collectLeadPrompt}
                            onChange={(e) => setCollectLeadPrompt(e.target.value)}
                            className="w-full rounded-xl border border-white/15 bg-[#181b26] p-3 text-xs text-white focus:border-cyan-400 focus:outline-none leading-relaxed"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* EDIÇÃO DO BLOCO 5: ENTREGA FINAL NO DIRECT */}
                  {selectedNode === "dm_delivery" && (
                    <div className="space-y-4 rounded-2xl border border-purple-500/30 bg-purple-500/5 p-4">
                      <h3 className="font-display text-base font-bold text-purple-300">
                        🎁 5. Entrega Final no Direct (Link / Recompensa)
                      </h3>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-300">
                          Mensagem final de entrega:
                        </label>
                        <textarea
                          rows={4}
                          value={dmMessage}
                          onChange={(e) => setDmMessage(e.target.value)}
                          className="w-full rounded-xl border border-white/15 bg-[#181b26] p-3 text-xs text-white focus:border-purple-400 focus:outline-none leading-relaxed"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-300">
                          Título do Botão Clicável:
                        </label>
                        <Input
                          value={dmButtonTitle}
                          onChange={(e) => setDmButtonTitle(e.target.value)}
                          placeholder="Abrir Acesso Exclusivo 🚀"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-300">
                          Link (URL) que será aberto quando clicar:
                        </label>
                        <Input
                          value={dmButtonUrl}
                          onChange={(e) => setDmButtonUrl(e.target.value)}
                          placeholder="https://grupomercatta.com.br"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODO 2: SIMULADOR AO VIVO */}
              {drawerMode === "simulator" && (
                <div className="space-y-4">
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] text-zinc-400">Cliente simulado</label>
                        <Input
                          value={simUsername}
                          onChange={(e) => setSimUsername(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-zinc-400">Comentário no Reel</label>
                        <Input
                          value={simCommentText}
                          onChange={(e) => setSimCommentText(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#181b26] p-2.5">
                      <span className="text-xs font-medium text-zinc-200">
                        Status do cliente no teste:
                      </span>
                      <button
                        type="button"
                        onClick={() => setSimIsFollowing((v) => !v)}
                        className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                          simIsFollowing
                            ? "border border-emerald-400 bg-emerald-500/20 text-emerald-300"
                            : "border border-amber-400 bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {simIsFollowing ? "✅ JÁ SEGUE" : "❌ NÃO SEGUE"}
                      </button>
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      disabled={busySim}
                      onClick={() => handleRunSimulation("trigger")}
                    >
                      {busySim ? <Spinner /> : "▶"} Testar Comentário "{simCommentText}"
                    </Button>
                  </div>

                  <div className="min-h-[22rem] max-h-[28rem] space-y-2.5 overflow-y-auto rounded-2xl border border-white/10 bg-black/80 p-3.5">
                    {simFeed.length === 0 ? (
                      <div className="flex h-60 flex-col items-center justify-center text-center text-xs text-zinc-400">
                        <p className="font-semibold text-white">Simulador Interativo Pronto</p>
                        <p className="mt-1">
                          Clique no botão acima para ver o fluxo responder o comentário, cobrar o seguir e entregar o link!
                        </p>
                      </div>
                    ) : (
                      simFeed.map((msg, i) => (
                        <div
                          key={i}
                          className={`rounded-xl p-3 text-xs ${
                            msg.sender === "user_comment"
                              ? "border border-white/15 bg-white/10 text-white"
                              : msg.sender === "bot_comment"
                                ? "ml-3 border border-indigo-400/40 bg-indigo-500/20 text-indigo-100"
                                : msg.sender === "user_dm"
                                  ? "ml-8 bg-pink-600 text-white"
                                  : "mr-4 border border-white/15 bg-[#181b26] text-zinc-100"
                          }`}
                        >
                          <p className="mb-1 text-[10px] font-bold uppercase opacity-75">
                            {msg.sender === "user_comment"
                              ? "💬 Comentário no Reel"
                              : msg.sender === "bot_comment"
                                ? "🤖 Resposta no Comentário"
                                : msg.sender === "user_dm"
                                  ? `📩 @${simUsername}`
                                  : "📩 Direct Automático"}
                          </p>
                          <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                          {msg.quickReplyLabel && (
                            <button
                              type="button"
                              disabled={busySim}
                              onClick={() => handleRunSimulation("check_follow")}
                              className="mt-2.5 w-full rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30"
                            >
                              {msg.quickReplyLabel} (Testar clique)
                            </button>
                          )}
                          {msg.buttonUrl && (
                            <a
                              href={msg.buttonUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2.5 block w-full rounded-lg bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-3 py-2 text-center text-xs font-bold text-white"
                            >
                              {msg.buttonTitle || "Abrir Link 🚀"} ↗
                            </a>
                          )}
                        </div>
                      ))
                    )}

                    {simStage === "awaiting_lead_input" && (
                      <div className="flex items-center gap-2 pt-2">
                        <Input
                          value={simLeadInput}
                          onChange={(e) => setSimLeadInput(e.target.value)}
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
              )}

              {/* MODO 3: CRM DE LEADS E INTERAÇÕES */}
              {drawerMode === "crm" && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
                    <p className="font-semibold text-white">🔗 Webhook Oficial Meta</p>
                    <p className="mt-1 font-mono text-[11px] text-pink-300 break-all">
                      {webhookUrl}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      Verify Token: <code>mercatta_mix_webhook_2026</code>
                    </p>
                  </div>

                  <div className="space-y-2">
                    {initialSessions.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-xl border border-white/10 bg-[#181b26] p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-white">@{s.igUsername || s.igSenderId}</strong>
                          <Badge tone={s.stage === "delivered" ? "success" : "warn"}>
                            {s.stage === "delivered" ? "Entregue ✓" : "Na Trava"}
                          </Badge>
                        </div>
                        <p className="text-zinc-400">
                          Comentou: <span className="font-mono text-zinc-200">{s.triggerText}</span>
                        </p>
                        {(s.leadWhatsapp || s.leadEmail) && (
                          <p className="font-mono text-emerald-300">
                            📞 Lead: {s.leadWhatsapp || s.leadEmail}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={busySave}
              onClick={handleSaveAutomation}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-4 font-display text-xs font-bold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
            >
              {busySave ? <Spinner /> : "💾"} Salvar e Publicar Fluxo
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
