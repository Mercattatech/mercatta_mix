"use client";

import { useMemo, useRef, useState } from "react";
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

const DEFAULT_POSITIONS: Record<NodeId, NodePos> = {
  trigger: { x: 40, y: 150 },
  comment_reply: { x: 350, y: 40 },
  follow_gate: { x: 350, y: 240 },
  not_following: { x: 680, y: 390 },
  lead_capture: { x: 680, y: 190 },
  dm_delivery: { x: 1000, y: 170 },
};

const NODE_WIDTH = 256;

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

  // Estado dos blocos da automação
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

  // Estado do Canvas Visual Drag & Drop (Caixinhas e Conectores)
  const [nodePositions, setNodePositions] = useState<Record<NodeId, NodePos>>(DEFAULT_POSITIONS);
  const [selectedNode, setSelectedNode] = useState<NodeId>("trigger");
  const [rightPanelTab, setRightPanelTab] = useState<"inspector" | "simulator">("inspector");
  const [zoom, setZoom] = useState<number>(0.92);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 10, y: 10 });

  const draggingNodeRef = useRef<{
    id: NodeId;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const panningCanvasRef = useRef<{
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: NodeId;
    port: "out" | "yes" | "no";
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

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

  // Calcula dinamicamente os conectores (fios curvos Bezier) entre as caixinhas ativas
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
        label: "1º Responde Comentário",
      });
      list.push({
        id: "e-comment-next",
        from: "comment_reply",
        fromPort: "out",
        to: nextAfterTrigger,
        color: "#8b5cf6",
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
      return { x: pos.x, y: pos.y + 58 };
    }
    if (nodeId === "follow_gate") {
      if (port === "yes") return { x: pos.x + NODE_WIDTH, y: pos.y + 52 };
      if (port === "no") return { x: pos.x + NODE_WIDTH, y: pos.y + 115 };
    }
    return { x: pos.x + NODE_WIDTH, y: pos.y + 58 };
  }

  function makeBezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  // Eventos de Arrastar Caixinha (Drag Node) e Pan do Canvas
  function handleNodePointerDown(e: React.PointerEvent, id: NodeId) {
    e.stopPropagation();
    setSelectedNode(id);
    setRightPanelTab("inspector");
    const pos = nodePositions[id];
    draggingNodeRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  }

  function handlePortPointerDown(e: React.PointerEvent, nodeId: NodeId, port: "out" | "yes" | "no") {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;
    setConnectingFrom({ nodeId, port, mouseX, mouseY });
  }

  function handlePortPointerUp(e: React.PointerEvent, targetNodeId: NodeId) {
    e.stopPropagation();
    if (!connectingFrom || connectingFrom.nodeId === targetNodeId) {
      setConnectingFrom(null);
      return;
    }
    // Ativa automaticamente o bloco alvo se o usuário arrastou um conector até ele!
    if (targetNodeId === "comment_reply") setReplyToComment(true);
    if (targetNodeId === "follow_gate" || targetNodeId === "not_following") setRequireFollow(true);
    if (targetNodeId === "lead_capture" && collectLeadField === "none") {
      setCollectLeadField("whatsapp");
    }
    setSelectedNode(targetNodeId);
    setConnectingFrom(null);
  }

  function handleCanvasPointerDown(e: React.PointerEvent) {
    panningCanvasRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
  }

  function handleCanvasPointerMove(e: React.PointerEvent) {
    if (draggingNodeRef.current) {
      const { id, startX, startY, origX, origY } = draggingNodeRef.current;
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;
      setNodePositions((prev) => ({
        ...prev,
        [id]: {
          x: Math.max(10, Math.round(origX + dx)),
          y: Math.max(10, Math.round(origY + dy)),
        },
      }));
      return;
    }
    if (connectingFrom && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setConnectingFrom((prev) =>
        prev
          ? {
              ...prev,
              mouseX: (e.clientX - rect.left - pan.x) / zoom,
              mouseY: (e.clientY - rect.top - pan.y) / zoom,
            }
          : null,
      );
      return;
    }
    if (panningCanvasRef.current) {
      const { startX, startY, origPanX, origPanY } = panningCanvasRef.current;
      setPan({
        x: origPanX + (e.clientX - startX),
        y: origPanY + (e.clientY - startY),
      });
    }
  }

  function handleCanvasPointerUp() {
    draggingNodeRef.current = null;
    panningCanvasRef.current = null;
    setConnectingFrom(null);
  }

  function resetCanvasLayout() {
    setNodePositions(DEFAULT_POSITIONS);
    setZoom(0.92);
    setPan({ x: 10, y: 10 });
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
    setSuccessMsg(`Modelo "${tpl.title}" carregado no Canvas! Clique em Salvar e Publicar Fluxo para ativar.`);
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
      setSuccessMsg(`Fluxo "${data.automation.name}" salvo e publicado com sucesso!`);
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
      setError("Salve o fluxo primeiro para testar no simulador.");
      return;
    }
    setBusySim(true);
    setError(null);
    setRightPanelTab("simulator");
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

      // Ilumina no Canvas as caixinhas percorridas!
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
        `Varredura concluída! ${data.checkedMedia ?? 0} Reels/Posts verificados na Meta Graph API e ${data.triggeredCount ?? 0} novo(s) comentário(s) respondido(s) automaticamente.`,
      );
      router.refresh();
    } finally {
      setBusySync(false);
    }
  }

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

  return (
    <div className="space-y-6">
      {/* Barra Superior do Studio Automações Mix */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-lg text-white shadow">
              ⚡
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Automações Mix — Construtor Visual de Fluxos
              </h1>
              <p className="text-xs text-muted">
                Arraste as caixinhas no canvas, conecte os blocos e clique em qualquer etapa para editar.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busySync}
            onClick={handleSyncRealComments}
          >
            {busySync ? <Spinner /> : "🔄"} Varrer Comentários Reais Agora
          </Button>
          <button
            type="button"
            disabled={busySave}
            onClick={handleSaveAutomation}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-5 font-display text-xs font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
          >
            {busySave ? <Spinner /> : "💾"} Salvar e Publicar Fluxo
          </button>
        </div>
      </div>

      {/* KPIs Rápidos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="p-3.5">
          <p className="text-[11px] text-muted">Gatilhos Acionados</p>
          <p className="mt-0.5 font-display text-xl font-bold text-fg">{totals.triggers}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[11px] text-muted">Comentários Respondidos</p>
          <p className="mt-0.5 font-display text-xl font-bold text-primary">{totals.comments}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[11px] text-muted">Directs (DMs) Enviados</p>
          <p className="mt-0.5 font-display text-xl font-bold text-pink-400">{totals.dms}</p>
        </Card>
        <Card className="p-3.5 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-[11px] text-emerald-300">Seguidores Ganhos (Trava)</p>
          <p className="mt-0.5 font-display text-xl font-bold text-emerald-400">+{totals.followers}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[11px] text-muted">Leads Capturados</p>
          <p className="mt-0.5 font-display text-xl font-bold text-amber-400">{totals.leads}</p>
        </Card>
      </div>

      {error && <Alert>{error}</Alert>}
      {successMsg && <Alert tone="success">{successMsg}</Alert>}

      {/* Seletor de Fluxos Ativos + Modelos Prontos */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted pl-1">Fluxos salvos:</span>
          {initialAutomations.map((auto) => (
            <button
              key={auto.id}
              type="button"
              onClick={() => loadAutomationIntoForm(auto)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                selectedAutoId === auto.id
                  ? "border-primary bg-primary/15 text-fg ring-1 ring-primary"
                  : "border-border bg-surface-2/50 text-muted hover:text-fg"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  auto.status === "active" ? "bg-emerald-400" : "bg-zinc-500"
                }`}
              />
              <span className="max-w-[14rem] truncate">{auto.name}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted mr-1">Modelos prontos:</span>
          {PRESET_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => applyPresetTemplate(tpl)}
              className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg transition hover:border-primary"
            >
              {tpl.badge}
            </button>
          ))}
        </div>
      </div>

      {/* ÁREA PRINCIPAL: CANVAS ARRASTA E SOLTA (8 COLS) + PAINEL INSPETOR / SIMULADOR (4 COLS) */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* CANVAS DE FLUXO VISUAL (DRAG & DROP) */}
        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-border bg-[#0b0c10] overflow-hidden shadow-2xl">
          {/* Barra de Ferramentas do Canvas (Paleta de Blocos + Zoom) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-surface/90 px-4 py-2.5 backdrop-blur">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted mr-1">
                Blocos do Fluxo:
              </span>
              <button
                type="button"
                onClick={() => {
                  setReplyToComment((v) => !v);
                  setSelectedNode("comment_reply");
                  setRightPanelTab("inspector");
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  replyToComment
                    ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-200"
                    : "border-border bg-surface-2 text-muted"
                }`}
              >
                {replyToComment ? "✓" : "+"} 💬 Resposta Comentário
              </button>
              <button
                type="button"
                onClick={() => {
                  setRequireFollow((v) => !v);
                  setSelectedNode("follow_gate");
                  setRightPanelTab("inspector");
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  requireFollow
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-200"
                    : "border-border bg-surface-2 text-muted"
                }`}
              >
                {requireFollow ? "✓" : "+"} 🔒 Trava Seguidor
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = collectLeadField === "none" ? "whatsapp" : "none";
                  setCollectLeadField(next);
                  setSelectedNode("lead_capture");
                  setRightPanelTab("inspector");
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  collectLeadField !== "none"
                    ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-200"
                    : "border-border bg-surface-2 text-muted"
                }`}
              >
                {collectLeadField !== "none" ? "✓" : "+"} 📲 Capturar Lead
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.55, Number((z - 0.1).toFixed(2))))}
                className="h-7 w-7 rounded-lg border border-border bg-surface-2 text-xs font-bold hover:bg-surface"
                title="Diminuir zoom"
              >
                −
              </button>
              <span className="min-w-[3rem] text-center font-mono text-xs text-muted">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.3, Number((z + 0.1).toFixed(2))))}
                className="h-7 w-7 rounded-lg border border-border bg-surface-2 text-xs font-bold hover:bg-surface"
                title="Aumentar zoom"
              >
                +
              </button>
              <button
                type="button"
                onClick={resetCanvasLayout}
                className="ml-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-fg"
              >
                Centralizar
              </button>
            </div>
          </div>

          {/* Área Interativa do Canvas com Grade Pontilhada */}
          <div
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            className="relative h-[38rem] w-full cursor-grab select-none overflow-hidden active:cursor-grabbing"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px)",
              backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          >
            {/* Camada Transformada (Pan + Zoom) */}
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                width: 1400,
                height: 700,
              }}
              className="relative"
            >
              {/* Camada SVG de Conectores Curvos (Edges) */}
              <svg
                width={1400}
                height={700}
                className="pointer-events-none absolute inset-0 overflow-visible"
              >
                <defs>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {edges.map((edge) => {
                  const start = getPortCoords(edge.from, edge.fromPort);
                  const end = getPortCoords(edge.to, "in");
                  const pathD = makeBezierPath(start.x, start.y, end.x, end.y);
                  const midX = (start.x + end.x) / 2;
                  const midY = (start.y + end.y) / 2 - 10;
                  const isSimActive =
                    activeSimNodes.includes(edge.from) && activeSimNodes.includes(edge.to);

                  return (
                    <g key={edge.id}>
                      {/* Sombra do fio */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={edge.color}
                        strokeOpacity={isSimActive ? 0.45 : 0.18}
                        strokeWidth={isSimActive ? 8 : 5}
                      />
                      {/* Fio principal tracejado animado */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={edge.color}
                        strokeWidth={2.5}
                        strokeDasharray="6 4"
                      />
                      {/* Seta / Bolinha no destino */}
                      <circle cx={end.x} cy={end.y} r={5} fill={edge.color} />
                      {/* Rótulo no meio do conector */}
                      {edge.label && (
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x={-58}
                            y={-10}
                            width={116}
                            height={20}
                            rx={6}
                            fill="#12131a"
                            stroke={edge.color}
                            strokeOpacity={0.5}
                            strokeWidth={1}
                          />
                          <text
                            x={0}
                            y={3}
                            textAnchor="middle"
                            fill="#e4e4e7"
                            fontSize={10}
                            fontWeight={600}
                          >
                            {edge.label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Linha temporária ao arrastar um conector com o mouse */}
                {connectingFrom && (
                  <path
                    d={makeBezierPath(
                      getPortCoords(connectingFrom.nodeId, connectingFrom.port).x,
                      getPortCoords(connectingFrom.nodeId, connectingFrom.port).y,
                      connectingFrom.mouseX,
                      connectingFrom.mouseY,
                    )}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                  />
                )}
              </svg>

              {/* CAIXINHA 1: GATILHO DO INSTAGRAM */}
              <div
                onPointerDown={(e) => handleNodePointerDown(e, "trigger")}
                style={{
                  left: nodePositions.trigger.x,
                  top: nodePositions.trigger.y,
                  width: NODE_WIDTH,
                }}
                className={`absolute rounded-2xl border bg-[#151722] p-3.5 shadow-xl transition-shadow cursor-move ${
                  selectedNode === "trigger"
                    ? "border-pink-500 ring-2 ring-pink-500/40"
                    : "border-white/15 hover:border-pink-500/60"
                } ${activeSimNodes.includes("trigger") ? "ring-4 ring-emerald-400/70" : ""}`}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-xs text-white">
                      ⚡
                    </span>
                    <span className="font-display text-xs font-bold text-white">
                      1. Gatilho Inicial
                    </span>
                  </div>
                  <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-pink-300">
                    Início
                  </span>
                </div>

                <div className="mt-2.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Conta:</span>
                    <strong className="text-white">
                      @{selectedAccountObj?.username || "grupomercatta"}
                    </strong>
                  </div>
                  <div className="rounded-xl bg-black/40 p-2 text-[11px] text-zinc-200">
                    {triggerType === "comment"
                      ? "💬 Quando comentar no Reel/Post"
                      : triggerType === "dm"
                        ? "📩 Quando mandar Direct (DM)"
                        : "⚡ Comentário, Direct ou Story"}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {matchMode === "any_comment" ? (
                      <span className="rounded-md bg-pink-500/20 px-2 py-0.5 text-[10px] font-semibold text-pink-300">
                        Qualquer comentário
                      </span>
                    ) : (
                      parsedKeywords.slice(0, 5).map((kw) => (
                        <span
                          key={kw}
                          className="rounded-md border border-pink-500/30 bg-pink-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-pink-200"
                        >
                          {kw}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Porta de Saída */}
                <div
                  onPointerDown={(e) => handlePortPointerDown(e, "trigger", "out")}
                  title="Arraste para conectar a outro bloco"
                  className="absolute -right-2.5 top-[50px] flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full border-2 border-[#151722] bg-pink-500 shadow hover:scale-125 transition"
                />
              </div>

              {/* CAIXINHA 2: RESPOSTA PÚBLICA NO COMENTÁRIO */}
              {replyToComment && (
                <div
                  onPointerDown={(e) => handleNodePointerDown(e, "comment_reply")}
                  onPointerUp={(e) => handlePortPointerUp(e, "comment_reply")}
                  style={{
                    left: nodePositions.comment_reply.x,
                    top: nodePositions.comment_reply.y,
                    width: NODE_WIDTH,
                  }}
                  className={`absolute rounded-2xl border bg-[#151722] p-3.5 shadow-xl transition-shadow cursor-move ${
                    selectedNode === "comment_reply"
                      ? "border-indigo-400 ring-2 ring-indigo-500/40"
                      : "border-white/15 hover:border-indigo-400/60"
                  } ${activeSimNodes.includes("comment_reply") ? "ring-4 ring-emerald-400/70" : ""}`}
                >
                  {/* Porta de Entrada */}
                  <div className="absolute -left-2.5 top-[50px] h-5 w-5 rounded-full border-2 border-indigo-400 bg-[#151722]" />

                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-xs text-indigo-300">
                        💬
                      </span>
                      <span className="font-display text-xs font-bold text-white">
                        Responder Comentário
                      </span>
                    </div>
                    <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                      {parsedCommentReplies.length} variações
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1.5 text-[11px] text-zinc-300">
                    <p className="text-[10px] text-zinc-400">
                      Responde no post e chama atenção para a DM:
                    </p>
                    <div className="rounded-xl bg-black/40 p-2 italic text-zinc-200 line-clamp-2">
                      "{parsedCommentReplies[0] || "Te mandei no Direct! 🔥"}"
                    </div>
                  </div>

                  {/* Porta de Saída */}
                  <div
                    onPointerDown={(e) => handlePortPointerDown(e, "comment_reply", "out")}
                    title="Arraste para conectar"
                    className="absolute -right-2.5 top-[50px] flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full border-2 border-[#151722] bg-indigo-400 shadow hover:scale-125 transition"
                  />
                </div>
              )}

              {/* CAIXINHA 3: TRAVA DE SEGUIDOR ("SÓ ENTREGA SE SEGUIR") */}
              {requireFollow && (
                <div
                  onPointerDown={(e) => handleNodePointerDown(e, "follow_gate")}
                  onPointerUp={(e) => handlePortPointerUp(e, "follow_gate")}
                  style={{
                    left: nodePositions.follow_gate.x,
                    top: nodePositions.follow_gate.y,
                    width: NODE_WIDTH,
                  }}
                  className={`absolute rounded-2xl border bg-[#151722] p-3.5 shadow-xl transition-shadow cursor-move ${
                    selectedNode === "follow_gate"
                      ? "border-emerald-400 ring-2 ring-emerald-500/40"
                      : "border-emerald-500/30 hover:border-emerald-400/70"
                  } ${activeSimNodes.includes("follow_gate") ? "ring-4 ring-emerald-400/70" : ""}`}
                >
                  {/* Porta de Entrada */}
                  <div className="absolute -left-2.5 top-[50px] h-5 w-5 rounded-full border-2 border-emerald-400 bg-[#151722]" />

                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-xs text-emerald-300">
                        🔒
                      </span>
                      <span className="font-display text-xs font-bold text-white">
                        Trava de Seguidor
                      </span>
                    </div>
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                      Condição
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-2 text-[11px]">
                    <div className="rounded-xl bg-black/40 p-2 text-zinc-200 line-clamp-2">
                      {followGateMessage}
                    </div>
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-center text-[10px] font-semibold text-emerald-200">
                      Botão: {followGateButtonLabel}
                    </div>
                    <div className="flex items-center justify-between pt-1 text-[10px] font-semibold">
                      <span className="text-emerald-400">Saída 1: ✓ Segue</span>
                      <span className="text-amber-400">Saída 2: ✕ Não segue</span>
                    </div>
                  </div>

                  {/* Porta de Saída SIM (Verde) */}
                  <div
                    onPointerDown={(e) => handlePortPointerDown(e, "follow_gate", "yes")}
                    title="Saída SIM (Já segue o perfil)"
                    className="absolute -right-2.5 top-[44px] flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full border-2 border-[#151722] bg-emerald-400 shadow hover:scale-125 transition"
                  />
                  {/* Porta de Saída NÃO (Âmbar) */}
                  <div
                    onPointerDown={(e) => handlePortPointerDown(e, "follow_gate", "no")}
                    title="Saída NÃO (Ainda não segue)"
                    className="absolute -right-2.5 top-[107px] flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full border-2 border-[#151722] bg-amber-400 shadow hover:scale-125 transition"
                  />
                </div>
              )}

              {/* CAIXINHA 3B: AVISO "AINDA NÃO SEGUE" */}
              {requireFollow && (
                <div
                  onPointerDown={(e) => handleNodePointerDown(e, "not_following")}
                  onPointerUp={(e) => handlePortPointerUp(e, "not_following")}
                  style={{
                    left: nodePositions.not_following.x,
                    top: nodePositions.not_following.y,
                    width: NODE_WIDTH,
                  }}
                  className={`absolute rounded-2xl border bg-[#151722] p-3.5 shadow-xl transition-shadow cursor-move ${
                    selectedNode === "not_following"
                      ? "border-amber-400 ring-2 ring-amber-500/40"
                      : "border-amber-500/30 hover:border-amber-400/70"
                  } ${activeSimNodes.includes("not_following") ? "ring-4 ring-amber-400/70" : ""}`}
                >
                  {/* Porta de Entrada */}
                  <div className="absolute -left-2.5 top-[50px] h-5 w-5 rounded-full border-2 border-amber-400 bg-[#151722]" />

                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-xs text-amber-300">
                        👀
                      </span>
                      <span className="font-display text-xs font-bold text-white">
                        Se NÃO Estiver Seguindo
                      </span>
                    </div>
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                      Retenção
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-2 text-[11px]">
                    <p className="text-[10px] text-zinc-400">
                      Enviado quando clica no botão sem seguir:
                    </p>
                    <div className="rounded-xl bg-black/40 p-2 text-zinc-200 line-clamp-2">
                      {notFollowingMessage}
                    </div>
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-center text-[10px] text-amber-200">
                      🔄 Repete botão "{followGateButtonLabel}"
                    </div>
                  </div>
                </div>
              )}

              {/* CAIXINHA 4: CAPTURA DE LEAD (WHATSAPP / E-MAIL) */}
              {collectLeadField !== "none" && (
                <div
                  onPointerDown={(e) => handleNodePointerDown(e, "lead_capture")}
                  onPointerUp={(e) => handlePortPointerUp(e, "lead_capture")}
                  style={{
                    left: nodePositions.lead_capture.x,
                    top: nodePositions.lead_capture.y,
                    width: NODE_WIDTH,
                  }}
                  className={`absolute rounded-2xl border bg-[#151722] p-3.5 shadow-xl transition-shadow cursor-move ${
                    selectedNode === "lead_capture"
                      ? "border-cyan-400 ring-2 ring-cyan-500/40"
                      : "border-cyan-500/30 hover:border-cyan-400/70"
                  } ${activeSimNodes.includes("lead_capture") ? "ring-4 ring-emerald-400/70" : ""}`}
                >
                  {/* Porta de Entrada */}
                  <div className="absolute -left-2.5 top-[50px] h-5 w-5 rounded-full border-2 border-cyan-400 bg-[#151722]" />

                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/20 text-xs text-cyan-300">
                        📲
                      </span>
                      <span className="font-display text-xs font-bold text-white">
                        Capturar {collectLeadField === "whatsapp" ? "WhatsApp" : "E-mail"}
                      </span>
                    </div>
                    <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                      CRM Lead
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1.5 text-[11px]">
                    <div className="rounded-xl bg-black/40 p-2 text-zinc-200 line-clamp-2">
                      {collectLeadPrompt || "Me digita seu WhatsApp com DDD para liberar:"}
                    </div>
                  </div>

                  {/* Porta de Saída */}
                  <div
                    onPointerDown={(e) => handlePortPointerDown(e, "lead_capture", "out")}
                    className="absolute -right-2.5 top-[50px] flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full border-2 border-[#151722] bg-cyan-400 shadow hover:scale-125 transition"
                  />
                </div>
              )}

              {/* CAIXINHA 5: ENTREGA FINAL NO DIRECT (DM + LINK) */}
              <div
                onPointerDown={(e) => handleNodePointerDown(e, "dm_delivery")}
                onPointerUp={(e) => handlePortPointerUp(e, "dm_delivery")}
                style={{
                  left: nodePositions.dm_delivery.x,
                  top: nodePositions.dm_delivery.y,
                  width: NODE_WIDTH,
                }}
                className={`absolute rounded-2xl border bg-[#151722] p-3.5 shadow-xl transition-shadow cursor-move ${
                  selectedNode === "dm_delivery"
                    ? "border-purple-400 ring-2 ring-purple-500/40"
                    : "border-white/15 hover:border-purple-400/70"
                } ${activeSimNodes.includes("dm_delivery") ? "ring-4 ring-emerald-400/70" : ""}`}
              >
                {/* Porta de Entrada */}
                <div className="absolute -left-2.5 top-[50px] h-5 w-5 rounded-full border-2 border-purple-400 bg-[#151722]" />

                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/20 text-xs text-purple-300">
                      🎁
                    </span>
                    <span className="font-display text-xs font-bold text-white">
                      Entrega Final (Direct)
                    </span>
                  </div>
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    Sucesso
                  </span>
                </div>

                <div className="mt-2.5 space-y-2 text-[11px]">
                  <div className="rounded-xl bg-black/40 p-2 text-zinc-200 line-clamp-3">
                    {dmMessage}
                  </div>
                  {dmButtonUrl && (
                    <div className="rounded-lg bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-2.5 py-1.5 text-center text-[10px] font-bold text-white shadow">
                      🔗 {dmButtonTitle || "Acessar Agora"}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Legenda flutuante no rodapé do Canvas */}
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] text-zinc-300 backdrop-blur">
              <span>🖱️ Arraste qualquer caixinha para organizar</span>
              <span>·</span>
              <span>👆 Clique em uma caixinha para editar na lateral</span>
            </div>
          </div>
        </div>

        {/* PAINEL LATERAL DIREITO (4 COLS): INSPETOR DA CAIXINHA SELECIONADA + SIMULADOR AO VIVO */}
        <Card className="lg:col-span-4 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            {/* Abas do Painel Lateral */}
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setRightPanelTab("inspector")}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  rightPanelTab === "inspector"
                    ? "bg-primary text-white shadow"
                    : "text-muted hover:text-fg"
                }`}
              >
                ⚙️ Editar Caixinha
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab("simulator")}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  rightPanelTab === "simulator"
                    ? "bg-emerald-500 text-white shadow"
                    : "text-muted hover:text-fg"
                }`}
              >
                📱 Testar Fluxo ao Vivo
              </button>
            </div>

            {rightPanelTab === "inspector" ? (
              <div className="space-y-4">
                {/* Configuração Geral do Fluxo */}
                <div className="space-y-2.5 rounded-xl border border-border bg-surface-2/30 p-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Nome do Fluxo
                    </label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Conta do Instagram
                    </label>
                    {accounts.length > 5 && (
                      <Input
                        type="search"
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        placeholder="Buscar @conta..."
                        className="mb-1 h-8 text-xs"
                      />
                    )}
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="h-9 w-full rounded-xl border border-border bg-surface px-2.5 text-xs font-medium text-fg"
                    >
                      {filteredAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          @{acc.username || acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Selecionar rapidamente qual Caixinha editar */}
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { id: "trigger", label: "1. Gatilho" },
                      { id: "comment_reply", label: "2. Comentário" },
                      { id: "follow_gate", label: "3. Trava Seguidor" },
                      { id: "not_following", label: "3B. Não Segue" },
                      { id: "lead_capture", label: "4. Lead" },
                      { id: "dm_delivery", label: "5. Direct Final" },
                    ] as const
                  ).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSelectedNode(n.id)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                        selectedNode === n.id
                          ? "border-primary bg-primary/20 text-fg"
                          : "border-border bg-surface-2/40 text-muted hover:text-fg"
                      }`}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>

                {/* INSPETOR DA CAIXINHA 1: GATILHO */}
                {selectedNode === "trigger" && (
                  <div className="space-y-3 rounded-xl border border-pink-500/30 bg-pink-500/5 p-3.5">
                    <h3 className="font-display text-sm font-semibold text-pink-300">
                      ⚡ Editando: 1. Gatilho Inicial
                    </h3>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">Onde o cliente interage?</label>
                      <select
                        value={triggerType}
                        onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                        className="h-9 w-full rounded-xl border border-border bg-surface px-2.5 text-xs font-medium text-fg"
                      >
                        <option value="comment">💬 Comentário em Reel ou Post</option>
                        <option value="dm">📩 Mensagem no Direct (DM)</option>
                        <option value="any">⚡ Comentário + Direct + Story</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">Regra de ativação</label>
                      <select
                        value={matchMode}
                        onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                        className="h-9 w-full rounded-xl border border-border bg-surface px-2.5 text-xs font-medium text-fg"
                      >
                        <option value="contains">Contém qualquer uma das palavras-chave</option>
                        <option value="exact">Exatamente igual à palavra-chave</option>
                        <option value="any_comment">Qualquer comentário ou mensagem</option>
                      </select>
                    </div>
                    {matchMode !== "any_comment" && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted">
                          Palavras-chave (separe por vírgula)
                        </label>
                        <Input
                          value={keywordsText}
                          onChange={(e) => setKeywordsText(e.target.value)}
                          placeholder="QUERO, EU QUERO, LINK, ACESSO"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* INSPETOR DA CAIXINHA 2: RESPOSTA NO COMENTÁRIO */}
                {selectedNode === "comment_reply" && (
                  <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3.5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-semibold text-indigo-300">
                        💬 Editando: Responder Comentário
                      </h3>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold">
                        <input
                          type="checkbox"
                          checked={replyToComment}
                          onChange={(e) => setReplyToComment(e.target.checked)}
                          className="h-4 w-4 accent-indigo-500"
                        />
                        Ativo
                      </label>
                    </div>
                    <p className="text-xs text-muted">
                      Escreva 1 frase por linha. O sistema alterna entre elas a cada comentário para engajar o Reel:
                    </p>
                    <textarea
                      rows={4}
                      value={commentRepliesText}
                      onChange={(e) => setCommentRepliesText(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface p-2.5 text-xs text-fg focus:border-primary focus:outline-none"
                    />
                  </div>
                )}

                {/* INSPETOR DA CAIXINHA 3: TRAVA DE SEGUIDOR */}
                {selectedNode === "follow_gate" && (
                  <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-semibold text-emerald-300">
                        🔒 Editando: Trava de Seguidor
                      </h3>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                        <input
                          type="checkbox"
                          checked={requireFollow}
                          onChange={(e) => setRequireFollow(e.target.checked)}
                          className="h-4 w-4 accent-emerald-500"
                        />
                        Exigir Seguir
                      </label>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">
                        Mensagem enviada no Direct pedindo para seguir
                      </label>
                      <textarea
                        rows={4}
                        value={followGateMessage}
                        onChange={(e) => setFollowGateMessage(e.target.value)}
                        className="w-full rounded-xl border border-border bg-surface p-2.5 text-xs text-fg focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">Texto do Botão de Verificação</label>
                      <Input
                        value={followGateButtonLabel}
                        onChange={(e) => setFollowGateButtonLabel(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* INSPETOR DA CAIXINHA 3B: AINDA NÃO SEGUE */}
                {selectedNode === "not_following" && (
                  <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                    <h3 className="font-display text-sm font-semibold text-amber-300">
                      👀 Editando: Aviso "Ainda Não Segue"
                    </h3>
                    <p className="text-xs text-muted">
                      Mensagem enviada quando o cliente clica em "Já sigo!", mas a API da Meta detecta que ele ainda não seguiu seu perfil:
                    </p>
                    <textarea
                      rows={4}
                      value={notFollowingMessage}
                      onChange={(e) => setNotFollowingMessage(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface p-2.5 text-xs text-fg focus:border-primary focus:outline-none"
                    />
                  </div>
                )}

                {/* INSPETOR DA CAIXINHA 4: CAPTURA DE LEAD */}
                {selectedNode === "lead_capture" && (
                  <div className="space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3.5">
                    <h3 className="font-display text-sm font-semibold text-cyan-300">
                      📲 Editando: Captura de Lead no Direct
                    </h3>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">Qual dado pedir antes do link?</label>
                      <select
                        value={collectLeadField}
                        onChange={(e) => setCollectLeadField(e.target.value as CollectLeadField)}
                        className="h-9 w-full rounded-xl border border-border bg-surface px-2.5 text-xs font-medium text-fg"
                      >
                        <option value="none">Desativado (entregar link direto após seguir)</option>
                        <option value="whatsapp">Pedir WhatsApp com DDD</option>
                        <option value="email">Pedir melhor E-mail</option>
                      </select>
                    </div>
                    {collectLeadField !== "none" && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted">Mensagem pedindo o contato</label>
                        <textarea
                          rows={3}
                          value={collectLeadPrompt}
                          onChange={(e) => setCollectLeadPrompt(e.target.value)}
                          className="w-full rounded-xl border border-border bg-surface p-2.5 text-xs text-fg focus:border-primary focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* INSPETOR DA CAIXINHA 5: ENTREGA FINAL NO DIRECT */}
                {selectedNode === "dm_delivery" && (
                  <div className="space-y-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-3.5">
                    <h3 className="font-display text-sm font-semibold text-purple-300">
                      🎁 Editando: Entrega Final no Direct
                    </h3>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">Mensagem de entrega</label>
                      <textarea
                        rows={3}
                        value={dmMessage}
                        onChange={(e) => setDmMessage(e.target.value)}
                        className="w-full rounded-xl border border-border bg-surface p-2.5 text-xs text-fg focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">Texto do Botão com Link</label>
                      <Input
                        value={dmButtonTitle}
                        onChange={(e) => setDmButtonTitle(e.target.value)}
                        placeholder="Abrir Acesso Exclusivo 🚀"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">URL de Destino</label>
                      <Input
                        value={dmButtonUrl}
                        onChange={(e) => setDmButtonUrl(e.target.value)}
                        placeholder="https://grupomercatta.com.br"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ABA DO SIMULADOR EM TEMPO REAL */
              <div className="space-y-3">
                <div className="space-y-2 rounded-xl border border-border bg-surface-2/40 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted">Cliente</label>
                      <Input
                        value={simUsername}
                        onChange={(e) => setSimUsername(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted">Comentário</label>
                      <Input
                        value={simCommentText}
                        onChange={(e) => setSimCommentText(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-2">
                    <span className="text-[11px] font-medium">Cliente segue o perfil?</span>
                    <button
                      type="button"
                      onClick={() => setSimIsFollowing((v) => !v)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                        simIsFollowing
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      }`}
                    >
                      {simIsFollowing ? "✅ JÁ SEGUE" : "❌ NÃO SEGUE"}
                    </button>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    size="sm"
                    disabled={busySim}
                    onClick={() => handleRunSimulation("trigger")}
                  >
                    {busySim ? <Spinner /> : "▶"} Disparar Gatilho "{simCommentText}"
                  </Button>
                </div>

                <div className="min-h-[18rem] max-h-[22rem] space-y-2 overflow-y-auto rounded-2xl border border-border bg-black/80 p-3">
                  {simFeed.length === 0 ? (
                    <div className="flex h-52 flex-col items-center justify-center text-center text-xs text-muted">
                      <p>Clique em Disparar Gatilho acima para ver o fluxo funcionando e iluminando os blocos no Canvas!</p>
                    </div>
                  ) : (
                    simFeed.map((msg, i) => (
                      <div
                        key={i}
                        className={`rounded-xl p-2.5 text-xs ${
                          msg.sender === "user_comment"
                            ? "border border-border bg-surface-2/60 text-fg"
                            : msg.sender === "bot_comment"
                              ? "ml-3 border border-indigo-500/40 bg-indigo-500/15 text-fg"
                              : msg.sender === "user_dm"
                                ? "ml-8 bg-primary text-white"
                                : "mr-4 border border-border bg-surface text-fg"
                        }`}
                      >
                        <p className="mb-1 text-[10px] font-bold uppercase opacity-70">
                          {msg.sender === "user_comment"
                            ? "💬 Comentário no Reel"
                            : msg.sender === "bot_comment"
                              ? "🤖 Resposta no Comentário"
                              : msg.sender === "user_dm"
                                ? `📩 @${simUsername}`
                                : "📩 Direct Automático"}
                        </p>
                        <p className="whitespace-pre-line">{msg.text}</p>
                        {msg.quickReplyLabel && (
                          <button
                            type="button"
                            disabled={busySim}
                            onClick={() => handleRunSimulation("check_follow")}
                            className="mt-2 w-full rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
                          >
                            {msg.quickReplyLabel}
                          </button>
                        )}
                        {msg.buttonUrl && (
                          <a
                            href={msg.buttonUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block w-full rounded-lg bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-2.5 py-1.5 text-center text-xs font-semibold text-white"
                          >
                            {msg.buttonTitle || "Abrir Link 🚀"} ↗
                          </a>
                        )}
                      </div>
                    ))
                  )}

                  {simStage === "awaiting_lead_input" && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <Input
                        value={simLeadInput}
                        onChange={(e) => setSimLeadInput(e.target.value)}
                        className="h-8 text-xs"
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
          </div>

          <button
            type="button"
            disabled={busySave}
            onClick={handleSaveAutomation}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 px-4 font-display text-xs font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
          >
            {busySave ? <Spinner /> : "💾"} Salvar e Publicar Fluxo
          </button>
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
              Histórico em tempo real de todas as pessoas que passaram pelos seus fluxos de automação. Removedor de curiosos e validador de seguidores ativo.
            </p>
          </div>
          <span className="font-mono text-[11px] text-muted">Webhook: {webhookUrl}</span>
        </div>

        {initialSessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-2 pr-3">Usuário</th>
                  <th className="py-2 pr-3">Gatilho / Comentário</th>
                  <th className="py-2 pr-3">Segue o Perfil?</th>
                  <th className="py-2 pr-3">Etapa Atual no Fluxo</th>
                  <th className="py-2 pr-3">Lead Capturado</th>
                  <th className="py-2">Última Mensagem</th>
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
                        <Badge tone="primary">Aguardando Contato</Badge>
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
            Nenhuma interação registrada ainda. Clique na aba "📱 Testar Fluxo ao Vivo" na lateral direita para ver o fluxo em ação!
          </p>
        )}
      </Card>
    </div>
  );
}
