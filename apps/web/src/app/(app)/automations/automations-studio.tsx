"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CollectLeadField,
  CustomFlowEdge,
  CustomFlowGraph,
  CustomFlowNode,
  CustomNodeKind,
  InstagramAccountView,
  InstagramAutomationSessionView,
  InstagramAutomationView,
  MatchMode,
  SimulationStepResult,
  TriggerType,
} from "@mercatta/server";
import { Alert, Badge, Button, Input, Spinner } from "@/components/ui";

const NODE_WIDTH = 296;

const NODE_KIND_META: Record<
  CustomNodeKind,
  {
    icon: string;
    badge: string;
    defaultTitle: string;
    subtitle: string;
    borderColor: string;
    activeRing: string;
    badgeBg: string;
    edgeColor: string;
  }
> = {
  trigger: {
    icon: "⚡",
    badge: "Início",
    defaultTitle: "Quando o Cliente Interagir",
    subtitle: "Gatilho do Instagram",
    borderColor: "border-pink-500/45 hover:border-pink-400",
    activeRing: "border-pink-500 ring-2 ring-pink-500/40",
    badgeBg: "bg-pink-500/20 text-pink-300",
    edgeColor: "#ec4899",
  },
  comment_reply: {
    icon: "💬",
    badge: "Comentário",
    defaultTitle: "Responder no Comentário",
    subtitle: "Resposta pública no Reel/Post",
    borderColor: "border-indigo-500/45 hover:border-indigo-400",
    activeRing: "border-indigo-400 ring-2 ring-indigo-500/40",
    badgeBg: "bg-indigo-500/20 text-indigo-300",
    edgeColor: "#818cf8",
  },
  follow_gate: {
    icon: "🔒",
    badge: "Condição",
    defaultTitle: "Trava: Segue o Perfil?",
    subtitle: "2 saídas: ✓ Segue / ✕ Não segue",
    borderColor: "border-emerald-500/45 hover:border-emerald-400",
    activeRing: "border-emerald-400 ring-2 ring-emerald-500/40",
    badgeBg: "bg-emerald-500/20 text-emerald-300",
    edgeColor: "#10b981",
  },
  not_following: {
    icon: "👀",
    badge: "Retenção",
    defaultTitle: "Aviso: Ainda Não Segue",
    subtitle: "Enviado se clicar sem seguir",
    borderColor: "border-amber-500/45 hover:border-amber-400",
    activeRing: "border-amber-400 ring-2 ring-amber-500/40",
    badgeBg: "bg-amber-500/20 text-amber-300",
    edgeColor: "#f59e0b",
  },
  lead_capture: {
    icon: "📲",
    badge: "Captura",
    defaultTitle: "Pedir WhatsApp / E-mail",
    subtitle: "Aguarda resposta e salva no CRM",
    borderColor: "border-cyan-500/45 hover:border-cyan-400",
    activeRing: "border-cyan-400 ring-2 ring-cyan-500/40",
    badgeBg: "bg-cyan-500/20 text-cyan-300",
    edgeColor: "#06b6d4",
  },
  dm_message: {
    icon: "📩",
    badge: "Direct",
    defaultTitle: "Mensagem no Direct + Link",
    subtitle: "Envia texto e botão clicável",
    borderColor: "border-purple-500/45 hover:border-purple-400",
    activeRing: "border-purple-400 ring-2 ring-purple-500/40",
    badgeBg: "bg-purple-500/20 text-purple-300",
    edgeColor: "#a855f7",
  },
  delay: {
    icon: "⏱️",
    badge: "Delay",
    defaultTitle: "Aguardar Tempo",
    subtitle: "Pausa antes do próximo bloco",
    borderColor: "border-sky-500/45 hover:border-sky-400",
    activeRing: "border-sky-400 ring-2 ring-sky-500/40",
    badgeBg: "bg-sky-500/20 text-sky-300",
    edgeColor: "#38bdf8",
  },
  tag_crm: {
    icon: "🏷️",
    badge: "Tag CRM",
    defaultTitle: "Aplicar Etiqueta no Lead",
    subtitle: "Classifica o contato no CRM",
    borderColor: "border-fuchsia-500/45 hover:border-fuchsia-400",
    activeRing: "border-fuchsia-400 ring-2 ring-fuchsia-500/40",
    badgeBg: "bg-fuchsia-500/20 text-fuchsia-300",
    edgeColor: "#e879f9",
  },
};

const PRESET_TEMPLATES = [
  {
    id: "reel_lead_magnet",
    badge: "🔥 Isca Digital (QUERO)",
    title: "Isca Digital nos Reels (Comente QUERO + Só entrega se seguir)",
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
];

function buildGraphFromFields(cfg: {
  replyToComment: boolean;
  commentReplies: string[];
  requireFollow: boolean;
  followGateMessage: string;
  followGateButtonLabel: string;
  notFollowingMessage: string;
  collectLeadField: CollectLeadField;
  collectLeadPrompt: string;
  dmMessage: string;
  dmButtonTitle: string;
  dmButtonUrl: string;
}): CustomFlowGraph {
  const nodes: CustomFlowNode[] = [
    {
      id: "trigger",
      kind: "trigger",
      title: "1. Quando o Cliente",
      x: 50,
      y: 180,
    },
  ];
  const edges: CustomFlowEdge[] = [];

  if (cfg.replyToComment) {
    nodes.push({
      id: "comment_reply",
      kind: "comment_reply",
      title: "Responder no Comentário",
      x: 410,
      y: 40,
      commentReplies: cfg.commentReplies,
      text: cfg.commentReplies.join("\n"),
    });
  }

  if (cfg.requireFollow) {
    nodes.push({
      id: "follow_gate",
      kind: "follow_gate",
      title: "Trava de Seguidor",
      x: 410,
      y: 250,
      text: cfg.followGateMessage,
      buttonTitle: cfg.followGateButtonLabel,
    });
    nodes.push({
      id: "not_following",
      kind: "not_following",
      title: "Aviso: Ainda Não Segue",
      x: 790,
      y: 420,
      text: cfg.notFollowingMessage,
    });
  }

  if (cfg.collectLeadField !== "none") {
    nodes.push({
      id: "lead_capture",
      kind: "lead_capture",
      title: cfg.collectLeadField === "email" ? "Pedir E-mail" : "Pedir WhatsApp",
      x: 790,
      y: 170,
      leadField: cfg.collectLeadField,
      text:
        cfg.collectLeadPrompt ||
        "Me digita seu WhatsApp com DDD (ex.: 11999999999) para liberar:",
    });
  }

  const dmX = cfg.collectLeadField !== "none" ? 1160 : cfg.requireFollow ? 790 : 410;
  nodes.push({
    id: "dm_delivery",
    kind: "dm_message",
    title: "Entrega Final no Direct",
    x: dmX,
    y: 170,
    text: cfg.dmMessage,
    buttonTitle: cfg.dmButtonTitle,
    buttonUrl: cfg.dmButtonUrl,
  });

  const firstDmTarget = cfg.requireFollow
    ? "follow_gate"
    : cfg.collectLeadField !== "none"
      ? "lead_capture"
      : "dm_delivery";

  if (cfg.replyToComment) {
    edges.push({
      id: "e-trigger-comment",
      from: "trigger",
      fromPort: "out",
      to: "comment_reply",
      color: "#ec4899",
      label: "1º Responde no Reel",
    });
    edges.push({
      id: "e-comment-next",
      from: "comment_reply",
      fromPort: "out",
      to: firstDmTarget,
      color: "#818cf8",
      label: "Chama no Direct",
    });
  } else {
    edges.push({
      id: "e-trigger-direct",
      from: "trigger",
      fromPort: "out",
      to: firstDmTarget,
      color: "#ec4899",
      label: "Envia Direct",
    });
  }

  if (cfg.requireFollow) {
    const afterFollow = cfg.collectLeadField !== "none" ? "lead_capture" : "dm_delivery";
    edges.push({
      id: "e-follow-yes",
      from: "follow_gate",
      fromPort: "yes",
      to: afterFollow,
      color: "#10b981",
      label: "✓ SIM, Segue",
    });
    edges.push({
      id: "e-follow-no",
      from: "follow_gate",
      fromPort: "no",
      to: "not_following",
      color: "#f59e0b",
      label: "✕ NÃO Segue",
    });
  }

  if (cfg.collectLeadField !== "none") {
    edges.push({
      id: "e-lead-dm",
      from: "lead_capture",
      fromPort: "out",
      to: "dm_delivery",
      color: "#06b6d4",
      label: "Contato Salvo",
    });
  }

  return { nodes, edges };
}

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

  // Configurações de Gatilho e Conta
  const [accountId, setAccountId] = useState<string>(
    activeAuto?.instagramAccountId ?? defaultAcc?.id ?? "",
  );
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

  // Grafo Personalizado de Caixas e Conectores (100% livre para criar/remover/ligar)
  const initialGraph = useMemo<CustomFlowGraph>(() => {
    if (activeAuto?.flowGraph && activeAuto.flowGraph.nodes?.length > 0) {
      return activeAuto.flowGraph;
    }
    return buildGraphFromFields({
      replyToComment: activeAuto?.replyToComment ?? true,
      commentReplies: activeAuto?.commentReplies ?? PRESET_TEMPLATES[0]!.commentReplies,
      requireFollow: activeAuto?.requireFollow ?? true,
      followGateMessage: activeAuto?.followGateMessage ?? PRESET_TEMPLATES[0]!.followGateMessage,
      followGateButtonLabel:
        activeAuto?.followGateButtonLabel ?? PRESET_TEMPLATES[0]!.followGateButtonLabel,
      notFollowingMessage:
        activeAuto?.notFollowingMessage ?? PRESET_TEMPLATES[0]!.notFollowingMessage,
      collectLeadField: activeAuto?.collectLeadField ?? "none",
      collectLeadPrompt: activeAuto?.collectLeadPrompt ?? "",
      dmMessage: activeAuto?.dmMessage ?? PRESET_TEMPLATES[0]!.dmMessage,
      dmButtonTitle: activeAuto?.dmButtonTitle ?? PRESET_TEMPLATES[0]!.dmButtonTitle,
      dmButtonUrl: activeAuto?.dmButtonUrl ?? PRESET_TEMPLATES[0]!.dmButtonUrl,
    });
  }, [activeAuto]);

  const [nodes, setNodes] = useState<CustomFlowNode[]>(initialGraph.nodes);
  const [edges, setEdges] = useState<CustomFlowEdge[]>(initialGraph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("trigger");
  const [drawerMode, setDrawerMode] = useState<"closed" | "inspector" | "simulator" | "crm">(
    "inspector",
  );
  const [zoom, setZoom] = useState<number>(0.88);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 24, y: 24 });

  // Estado para puxar uma linha conectora de uma bolinha até outra caixa
  const [connectingDraft, setConnectingDraft] = useState<{
    fromNodeId: string;
    fromPort: "out" | "yes" | "no";
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    mode: "node" | "pan";
    nodeId?: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
  } | null>(null);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const connectingDraftRef = useRef(connectingDraft);
  connectingDraftRef.current = connectingDraft;

  function applyZoomDelta(delta: number, clientX?: number, clientY?: number) {
    const prevZoom = zoomRef.current;
    const nextZoom = Math.min(1.75, Math.max(0.35, Number((prevZoom + delta).toFixed(2))));
    if (nextZoom === prevZoom) return;

    const viewport = canvasViewportRef.current;
    if (viewport && clientX !== undefined && clientY !== undefined) {
      const rect = viewport.getBoundingClientRect();
      const cursorX = clientX - rect.left;
      const cursorY = clientY - rect.top;
      const currentPan = panRef.current;
      const worldX = (cursorX - currentPan.x) / prevZoom;
      const worldY = (cursorY - currentPan.y) / prevZoom;
      setPan({
        x: Math.round(cursorX - worldX * nextZoom),
        y: Math.round(cursorY - worldY * nextZoom),
      });
    }
    setZoom(nextZoom);
  }

  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const step = e.ctrlKey ? -e.deltaY * 0.01 : e.deltaY < 0 ? 0.08 : -0.08;
      applyZoomDelta(step, e.clientX, e.clientY);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    function onWindowPointerMove(e: PointerEvent) {
      // Se estiver puxando um fio conector entre caixas
      const draft = connectingDraftRef.current;
      if (draft && canvasViewportRef.current) {
        const rect = canvasViewportRef.current.getBoundingClientRect();
        const z = zoomRef.current || 1;
        const p = panRef.current;
        const worldX = (e.clientX - rect.left - p.x) / z;
        const worldY = (e.clientY - rect.top - p.y) / z;
        setConnectingDraft((prev) =>
          prev ? { ...prev, mouseX: worldX, mouseY: worldY } : null,
        );
        return;
      }

      const st = dragStateRef.current;
      if (!st) return;
      const dxScreen = e.clientX - st.startClientX;
      const dyScreen = e.clientY - st.startClientY;
      if (!st.hasMoved && Math.hypot(dxScreen, dyScreen) < 5) {
        return;
      }
      st.hasMoved = true;

      if (st.mode === "node" && st.nodeId) {
        const z = zoomRef.current || 1;
        const nextX = Math.max(16, Math.round(st.origX + dxScreen / z));
        const nextY = Math.max(16, Math.round(st.origY + dyScreen / z));
        const targetId = st.nodeId;
        setNodes((prev) =>
          prev.map((n) => (n.id === targetId ? { ...n, x: nextX, y: nextY } : n)),
        );
      } else if (st.mode === "pan") {
        setPan({
          x: Math.round(st.origX + dxScreen),
          y: Math.round(st.origY + dyScreen),
        });
      }
    }

    function onWindowPointerUp() {
      dragStateRef.current = null;
      if (connectingDraftRef.current) {
        setConnectingDraft(null);
      }
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

  // Estado do Simulador Interativo
  const [simUsername, setSimUsername] = useState<string>("cliente.interessado");
  const [simCommentText, setSimCommentText] = useState<string>("EU QUERO");
  const [simIsFollowing, setSimIsFollowing] = useState<boolean>(false);
  const [simLeadInput, setSimLeadInput] = useState<string>("11998887766");
  const [simSessionId, setSimSessionId] = useState<string | null>(null);
  const [simStage, setSimStage] = useState<string>("idle");
  const [activeSimNodeIds, setActiveSimNodeIds] = useState<string[]>([]);
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

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? nodes[0] ?? null,
    [nodes, selectedNodeId],
  );

  const parsedKeywords = useMemo(
    () =>
      keywordsText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordsText],
  );

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

  // Funções de manipulação de Caixinhas (Criar, Duplicar, Excluir, Editar, Ligar/Desligar)
  function addNewBox(kind: CustomNodeKind) {
    const meta = NODE_KIND_META[kind];
    const id = `${kind}_${Date.now().toString(36)}`;
    const maxRight = nodes.reduce((max, n) => Math.max(max, n.x), 80);
    const newX = Math.min(1250, maxRight + 340);
    const newY = 140 + ((nodes.length * 55) % 260);

    const newNode: CustomFlowNode = {
      id,
      kind,
      title: meta.defaultTitle,
      x: newX,
      y: newY,
      ...(kind === "comment_reply"
        ? {
            text: "Acabei de te enviar no Direct! Confere lá 🔥\nTe mandei na DM agora mesmo! 🚀",
            commentReplies: [
              "Acabei de te enviar no Direct! Confere lá 🔥",
              "Te mandei na DM agora mesmo! 🚀",
            ],
          }
        : {}),
      ...(kind === "follow_gate"
        ? {
            text: "Opa, {nome}! Para liberar seu acesso exclusivo, confirme que você já segue o perfil {conta} clicando abaixo:",
            buttonTitle: "✅ Já sigo! Liberar meu acesso",
          }
        : {}),
      ...(kind === "not_following"
        ? {
            text: "Verifiquei aqui e você ainda não segue {conta} 👀 Siga nosso perfil primeiro e clique em '✅ Já sigo!' para liberar na hora!",
          }
        : {}),
      ...(kind === "lead_capture"
        ? {
            leadField: "whatsapp",
            text: "Qual é o seu WhatsApp com DDD (ex.: 11999999999) para eu registrar e liberar seu link?",
          }
        : {}),
      ...(kind === "dm_message"
        ? {
            text: "Aqui está o seu acesso exclusivo! 🎉 Toque no botão abaixo para abrir:",
            buttonTitle: "Abrir Acesso Agora 🚀",
            buttonUrl: "https://grupomercatta.com.br",
          }
        : {}),
      ...(kind === "delay"
        ? {
            delaySeconds: 5,
            text: "Aguardar 5 segundos antes da próxima mensagem",
          }
        : {}),
      ...(kind === "tag_crm"
        ? {
            tagName: "LEAD_QUENTE",
            text: "Marca o cliente com a etiqueta LEAD_QUENTE no CRM",
          }
        : {}),
    };

    // Conecta automaticamente a partir da caixa selecionada se ela tiver saída livre
    const sourceNode = selectedNode ?? nodes[nodes.length - 1];
    setNodes((prev) => [...prev, newNode]);

    if (sourceNode && sourceNode.id !== id) {
      const port: "out" | "yes" | "no" =
        sourceNode.kind === "follow_gate"
          ? kind === "not_following"
            ? "no"
            : "yes"
          : "out";
      const existingFromPort = edges.some(
        (e) => e.from === sourceNode.id && e.fromPort === port,
      );
      if (!existingFromPort) {
        const sourceMeta = NODE_KIND_META[sourceNode.kind];
        setEdges((prev) => [
          ...prev,
          {
            id: `e_${sourceNode.id}_${port}_${id}`,
            from: sourceNode.id,
            fromPort: port,
            to: id,
            color:
              port === "yes"
                ? "#10b981"
                : port === "no"
                  ? "#f59e0b"
                  : sourceMeta.edgeColor,
            label:
              port === "yes"
                ? "✓ SIM, Segue"
                : port === "no"
                  ? "✕ NÃO Segue"
                  : undefined,
          },
        ]);
      }
    }

    setSelectedNodeId(id);
    setDrawerMode("inspector");
  }

  function duplicateBox(node: CustomFlowNode) {
    if (node.kind === "trigger") return;
    const id = `${node.kind}_${Date.now().toString(36)}`;
    const copy: CustomFlowNode = {
      ...node,
      id,
      title: `${node.title} (Cópia)`,
      x: node.x + 40,
      y: node.y + 40,
    };
    setNodes((prev) => [...prev, copy]);
    setSelectedNodeId(id);
    setDrawerMode("inspector");
  }

  function deleteBox(nodeId: string) {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target || target.kind === "trigger") return;
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));
    setSelectedNodeId("trigger");
  }

  function updateNode(nodeId: string, patch: Partial<CustomFlowNode>) {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    );
  }

  function connectNodes(fromId: string, fromPort: "out" | "yes" | "no", toId: string) {
    if (fromId === toId) return;
    const sourceNode = nodes.find((n) => n.id === fromId);
    if (!sourceNode) return;
    const color =
      fromPort === "yes"
        ? "#10b981"
        : fromPort === "no"
          ? "#f59e0b"
          : NODE_KIND_META[sourceNode.kind].edgeColor;
    const label =
      fromPort === "yes"
        ? "✓ SIM, Segue"
        : fromPort === "no"
          ? "✕ NÃO Segue"
          : undefined;

    setEdges((prev) => {
      // Substitui conexão anterior da mesma porta de saída para manter o fluxo claro
      const filtered = prev.filter(
        (e) => !(e.from === fromId && e.fromPort === fromPort),
      );
      if (!toId) return filtered;
      return [
        ...filtered,
        {
          id: `e_${fromId}_${fromPort}_${toId}_${Date.now().toString(36)}`,
          from: fromId,
          fromPort,
          to: toId,
          color,
          ...(label ? { label } : {}),
        },
      ];
    });
  }

  function removeEdge(edgeId: string) {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }

  function startBlankCustomFlow() {
    setSelectedAutoId("new");
    setName("Meu Fluxo Personalizado");
    const blankTrigger: CustomFlowNode = {
      id: "trigger",
      kind: "trigger",
      title: "1. Quando o Cliente Interagir",
      x: 80,
      y: 200,
    };
    setNodes([blankTrigger]);
    setEdges([]);
    setSelectedNodeId("trigger");
    setDrawerMode("inspector");
    setSuccessMsg(
      "Fluxo em branco criado! Clique nos botões '+ Adicionar Caixa' na barra acima para montar e conectar as caixas do seu jeito.",
    );
  }

  function autoArrangeLayout() {
    const triggerNode = nodes.find((n) => n.kind === "trigger") ?? nodes[0];
    if (!triggerNode) return;
    const others = nodes.filter((n) => n.id !== triggerNode.id);
    const updated: CustomFlowNode[] = [
      { ...triggerNode, x: 50, y: 200 },
      ...others.map((n, idx) => {
        const col = Math.floor(idx / 2) + 1;
        const row = idx % 2;
        return {
          ...n,
          x: 50 + col * 370,
          y: others.length === 1 ? 200 : row === 0 ? 70 : 340,
        };
      }),
    ];
    setNodes(updated);
    setZoom(0.88);
    setPan({ x: 24, y: 24 });
  }

  function getPortCoords(
    nodeId: string,
    port: "in" | "out" | "yes" | "no",
  ): { x: number; y: number } {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    if (port === "in") {
      return { x: node.x, y: node.y + 68 };
    }
    if (node.kind === "follow_gate") {
      if (port === "yes") return { x: node.x + NODE_WIDTH, y: node.y + 64 };
      if (port === "no") return { x: node.x + NODE_WIDTH, y: node.y + 132 };
    }
    return { x: node.x + NODE_WIDTH, y: node.y + 68 };
  }

  function makeBezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(70, Math.abs(x2 - x1) * 0.48);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  function startDraggingNode(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedNodeId(id);
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    dragStateRef.current = {
      mode: "node",
      nodeId: id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: node.x,
      origY: node.y,
      hasMoved: false,
    };
  }

  function startStartingConnection(
    e: React.PointerEvent,
    fromNodeId: string,
    fromPort: "out" | "yes" | "no",
  ) {
    e.stopPropagation();
    e.preventDefault();
    const start = getPortCoords(fromNodeId, fromPort);
    setConnectingDraft({
      fromNodeId,
      fromPort,
      mouseX: start.x + 30,
      mouseY: start.y,
    });
  }

  function finishConnectionOnNode(e: React.PointerEvent, targetNodeId: string) {
    if (!connectingDraft) return;
    e.stopPropagation();
    connectNodes(connectingDraft.fromNodeId, connectingDraft.fromPort, targetNodeId);
    setConnectingDraft(null);
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
    const g =
      auto.flowGraph && auto.flowGraph.nodes?.length > 0
        ? auto.flowGraph
        : buildGraphFromFields({
            replyToComment: auto.replyToComment,
            commentReplies: auto.commentReplies,
            requireFollow: auto.requireFollow,
            followGateMessage: auto.followGateMessage,
            followGateButtonLabel: auto.followGateButtonLabel,
            notFollowingMessage: auto.notFollowingMessage,
            collectLeadField: auto.collectLeadField,
            collectLeadPrompt: auto.collectLeadPrompt,
            dmMessage: auto.dmMessage,
            dmButtonTitle: auto.dmButtonTitle,
            dmButtonUrl: auto.dmButtonUrl,
          });
    setNodes(g.nodes);
    setEdges(g.edges);
    setSelectedNodeId(g.nodes[0]?.id ?? "trigger");
    setSimFeed([]);
    setSimSessionId(null);
    setSimStage("idle");
    setActiveSimNodeIds([]);
  }

  function applyPresetTemplate(tpl: (typeof PRESET_TEMPLATES)[number]) {
    setSelectedAutoId("new");
    setName(tpl.title);
    setTriggerType(tpl.triggerType);
    setMatchMode(tpl.matchMode);
    setKeywordsText(tpl.keywords.join(", "));
    const g = buildGraphFromFields({
      replyToComment: tpl.replyToComment,
      commentReplies: tpl.commentReplies,
      requireFollow: tpl.requireFollow,
      followGateMessage: tpl.followGateMessage,
      followGateButtonLabel: tpl.followGateButtonLabel,
      notFollowingMessage: tpl.notFollowingMessage,
      collectLeadField: tpl.collectLeadField,
      collectLeadPrompt: tpl.collectLeadPrompt,
      dmMessage: tpl.dmMessage,
      dmButtonTitle: tpl.dmButtonTitle,
      dmButtonUrl: tpl.dmButtonUrl,
    });
    setNodes(g.nodes);
    setEdges(g.edges);
    setSelectedNodeId("trigger");
    setSimFeed([]);
    setSimSessionId(null);
    setSimStage("idle");
    setActiveSimNodeIds([]);
    setSuccessMsg(`Modelo "${tpl.badge}" carregado! Personalize as caixas como quiser.`);
  }

  // Extrai automaticamente os campos para o motor da Meta a partir das caixas montadas pelo usuário
  function deriveEngineFieldsFromGraph() {
    const commentNode = nodes.find((n) => n.kind === "comment_reply");
    const followNode = nodes.find((n) => n.kind === "follow_gate");
    const notFollowNode = nodes.find((n) => n.kind === "not_following");
    const leadNode = nodes.find((n) => n.kind === "lead_capture");
    const dmNodes = nodes.filter((n) => n.kind === "dm_message");
    const lastDmNode = dmNodes[dmNodes.length - 1];

    const combinedDmMessages =
      dmNodes.length > 0
        ? dmNodes
            .map((d) => (d.text || "").trim())
            .filter(Boolean)
            .join("\n\n")
        : "Olá! Aqui está o acesso que você pediu 🚀";

    const replyLines = (commentNode?.text ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const leadField: CollectLeadField =
      leadNode?.leadField === "email"
        ? "email"
        : leadNode
          ? "whatsapp"
          : "none";

    return {
      replyToComment: Boolean(commentNode),
      commentReplies:
        replyLines.length > 0
          ? replyLines
          : ["Acabei de te enviar no Direct! Confere lá 🔥"],
      requireFollow: Boolean(followNode),
      followGateMessage:
        followNode?.text ||
        "Opa, {nome}! Siga nosso perfil {conta} e toque no botão abaixo para liberar:",
      followGateButtonLabel: followNode?.buttonTitle || "✅ Já sigo! Liberar acesso",
      notFollowingMessage:
        notFollowNode?.text ||
        "Ainda não encontrei você seguindo {conta} 👀 Siga o perfil e clique no botão novamente!",
      collectLeadField: leadField,
      collectLeadPrompt: leadNode?.text || "",
      dmMessage: combinedDmMessages,
      dmButtonTitle: lastDmNode?.buttonTitle || "Acessar Agora 🚀",
      dmButtonUrl: lastDmNode?.buttonUrl || "",
    };
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
      const derived = deriveEngineFieldsFromGraph();
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
          ...derived,
          flowGraph: { nodes, edges },
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
      setSuccessMsg(`Fluxo personalizado "${data.automation.name}" salvo e publicado!`);
      router.refresh();
    } finally {
      setBusySave(false);
    }
  }

  async function handleRunSimulation(action: "trigger" | "check_follow" | "submit_lead") {
    const targetAutoId = selectedAutoId !== "new" ? selectedAutoId : initialAutomations[0]?.id;
    if (!targetAutoId) {
      setError("Clique em 'Salvar e Publicar Fluxo' primeiro para testar seu fluxo personalizado.");
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

      // Ilumina as caixas correspondentes no canvas
      const activeIds = nodes
        .filter((n) => {
          if (action === "trigger" && (n.kind === "trigger" || n.kind === "comment_reply"))
            return true;
          if (data.session.stage === "awaiting_follow" && n.kind === "follow_gate") return true;
          if (action === "check_follow" && !simIsFollowing && n.kind === "not_following")
            return true;
          if (data.session.stage === "awaiting_lead_input" && n.kind === "lead_capture")
            return true;
          if (
            data.session.stage === "delivered" &&
            (n.kind === "dm_message" || n.kind === "tag_crm" || n.kind === "delay")
          )
            return true;
          return false;
        })
        .map((n) => n.id);
      setActiveSimNodeIds(activeIds);

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
    /* WORKSPACE DE TELA CHEIA COM ALTURA E LARGURA 100% EXPLÍCITAS */
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] -my-8 flex h-[calc(100dvh-4rem)] min-h-[780px] w-screen flex-col overflow-hidden bg-[#08090d] text-white">
      {/* BARRA DE COMANDO SUPERIOR DO STUDIO */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#10121a] px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-sm font-bold text-white shadow">
              ⚡
            </span>
            <select
              value={selectedAutoId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "new") {
                  startBlankCustomFlow();
                } else {
                  const found = initialAutomations.find((a) => a.id === val);
                  if (found) loadAutomationIntoForm(found);
                }
              }}
              className="h-9 max-w-[17rem] rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs font-semibold text-white"
            >
              {initialAutomations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.status === "active" ? "🟢 " : "⏸️ "}
                  {a.name}
                </option>
              ))}
              <option value="new">✨ Criar Fluxo do Zero (Em Branco)...</option>
            </select>
          </div>

          <button
            type="button"
            onClick={startBlankCustomFlow}
            className="h-9 rounded-xl border border-pink-500/40 bg-pink-500/15 px-3 text-xs font-bold text-pink-200 transition hover:bg-pink-500/25"
            title="Começar um fluxo totalmente em branco para montar as caixas que quiser"
          >
            ✨ Novo Fluxo do Zero
          </button>

          {/* Seletor rápido da @conta */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#181b26] px-2.5 py-1.5">
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

          {/* Modelos Prontos */}
          <div className="hidden 2xl:flex items-center gap-1.5 border-l border-white/10 pl-3">
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
          <div className="hidden lg:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px]">
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
            👥 CRM ({initialSessions.length})
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
            📱 Testar Fluxo
          </button>

          <button
            type="button"
            disabled={busySync}
            onClick={handleSyncRealComments}
            className="h-9 rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
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
        <div
          onClick={() => {
            setError(null);
            setSuccessMsg(null);
          }}
          className="cursor-pointer absolute bottom-16 left-1/2 z-50 -translate-x-1/2 max-w-xl w-full px-4"
        >
          {error && <Alert>{error}</Alert>}
          {successMsg && <Alert tone="success">{successMsg}</Alert>}
        </div>
      )}

      {/* CORPO PRINCIPAL: CANVAS DE TELA CHEIA + GAVETA LATERAL RETRÁTIL */}
      <div className="relative flex h-[calc(100dvh-7.5rem)] min-h-[700px] w-full flex-1 overflow-hidden">
        {/* PALETA SUPERIOR DE CAIXAS: ADICIONE QUANTAS CAIXAS QUISER AO SEU FLUXO */}
        <div className="absolute left-4 top-4 z-30 flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/15 bg-[#12141f]/95 p-2 shadow-2xl backdrop-blur max-w-[calc(100vw-3rem)]">
          <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-pink-300">
            ➕ Adicionar Caixa:
          </span>

          <button
            type="button"
            onClick={() => addNewBox("comment_reply")}
            className="rounded-xl border border-indigo-400/40 bg-indigo-500/15 px-2.5 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/30"
          >
            + 💬 Resposta Comentário
          </button>

          <button
            type="button"
            onClick={() => addNewBox("dm_message")}
            className="rounded-xl border border-purple-400/40 bg-purple-500/15 px-2.5 py-1.5 text-xs font-semibold text-purple-200 transition hover:bg-purple-500/30"
          >
            + 📩 Mensagem Direct / Link
          </button>

          <button
            type="button"
            onClick={() => addNewBox("follow_gate")}
            className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
          >
            + 🔒 Condição: Segue o Perfil?
          </button>

          <button
            type="button"
            onClick={() => addNewBox("not_following")}
            className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
          >
            + 👀 Aviso Não Segue
          </button>

          <button
            type="button"
            onClick={() => addNewBox("lead_capture")}
            className="rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/30"
          >
            + 📲 Capturar WhatsApp/E-mail
          </button>

          <button
            type="button"
            onClick={() => addNewBox("delay")}
            className="rounded-xl border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/30"
          >
            + ⏱️ Espera (Delay)
          </button>

          <button
            type="button"
            onClick={() => addNewBox("tag_crm")}
            className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 px-2.5 py-1.5 text-xs font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/30"
          >
            + 🏷️ Tag CRM
          </button>

          <div className="h-5 w-px bg-white/10 mx-1" />

          <button
            type="button"
            onClick={autoArrangeLayout}
            className="rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            ✨ Organizar
          </button>
        </div>

        {/* BARRA DE ZOOM CENTRALIZADA NO RODAPÉ */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-2xl border border-white/15 bg-[#12141f]/95 px-3.5 py-2 shadow-2xl backdrop-blur">
          <span className="text-[11px] font-semibold text-zinc-400">🔍 Zoom:</span>
          <button
            type="button"
            onClick={() => applyZoomDelta(-0.12)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base font-bold text-white transition hover:bg-pink-500/25 hover:border-pink-500/40"
            title="Diminuir Zoom"
          >
            −
          </button>
          <input
            type="range"
            min={35}
            max={175}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="h-1.5 w-28 cursor-pointer accent-pink-500"
          />
          <span className="min-w-[3.2rem] text-center font-mono text-xs font-bold text-white">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => applyZoomDelta(0.12)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base font-bold text-white transition hover:bg-pink-500/25 hover:border-pink-500/40"
            title="Aumentar Zoom"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 24, y: 24 });
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/15 hover:text-white"
          >
            100%
          </button>
          <button
            type="button"
            onClick={autoArrangeLayout}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/15 hover:text-white"
          >
            Ajustar à Tela
          </button>
          <span className="hidden xl:inline text-[11px] text-zinc-400 pl-1">
            • Arraste da bolinha direita <strong className="text-pink-300">●</strong> de uma caixa até outra para ligar!
          </span>
        </div>

        {/* BOTÃO FLUTUANTE NA BORDA DIREITA QUANDO A ABA ESTÁ ENCOLHIDA */}
        {drawerMode === "closed" && (
          <button
            type="button"
            onClick={() => setDrawerMode("inspector")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-2 rounded-l-2xl border border-r-0 border-pink-500/50 bg-[#141726] px-3.5 py-4 text-xs font-bold text-white shadow-2xl transition hover:bg-pink-500/20"
            title="Expandir aba lateral de edição"
          >
            <span className="text-base text-pink-400">❮</span>
            <span className="[writing-mode:vertical-rl] rotate-180 tracking-wider uppercase text-[11px] font-bold text-zinc-200">
              Abrir Painel Lateral
            </span>
          </button>
        )}

        {/* CANVAS INFINITO DE TELA CHEIA */}
        <div
          ref={canvasViewportRef}
          onPointerDown={startPanningCanvas}
          className="relative h-full min-h-[700px] flex-1 cursor-grab select-none overflow-hidden active:cursor-grabbing"
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
              width: 2200,
              height: 1200,
            }}
            className="relative"
          >
            {/* CONECTORES CURVOS SVG + LINHA SENDO PUXADA PELO MOUSE */}
            <svg
              width={2200}
              height={1200}
              className="pointer-events-none absolute inset-0 overflow-visible"
            >
              {edges.map((edge) => {
                const start = getPortCoords(edge.from, edge.fromPort);
                const end = getPortCoords(edge.to, "in");
                const pathD = makeBezierPath(start.x, start.y, end.x, end.y);
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2 - 10;
                const color = edge.color || "#ec4899";
                const isSimActive =
                  activeSimNodeIds.includes(edge.from) && activeSimNodeIds.includes(edge.to);

                return (
                  <g key={edge.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeOpacity={isSimActive ? 0.45 : 0.2}
                      strokeWidth={isSimActive ? 9 : 6}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.5}
                      strokeDasharray="7 5"
                    />
                    <circle cx={start.x} cy={start.y} r={5} fill={color} />
                    <circle cx={end.x} cy={end.y} r={6} fill={color} />

                    {/* Etiqueta e botão × clicável para remover a conexão */}
                    <g
                      transform={`translate(${midX}, ${midY})`}
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEdge(edge.id);
                      }}
                    >
                      <rect
                        x={edge.label ? -68 : -14}
                        y={-11}
                        width={edge.label ? 136 : 28}
                        height={22}
                        rx={8}
                        fill="#11131c"
                        stroke={color}
                        strokeOpacity={0.7}
                        strokeWidth={1.3}
                      />
                      <text
                        x={0}
                        y={4}
                        textAnchor="middle"
                        fill="#f4f4f5"
                        fontSize={10.5}
                        fontWeight={600}
                      >
                        {edge.label ? `${edge.label}  ×` : "×"}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Linha viva quando o usuário está puxando um conector com o mouse */}
              {connectingDraft && (
                <path
                  d={makeBezierPath(
                    getPortCoords(connectingDraft.fromNodeId, connectingDraft.fromPort).x,
                    getPortCoords(connectingDraft.fromNodeId, connectingDraft.fromPort).y,
                    connectingDraft.mouseX,
                    connectingDraft.mouseY,
                  )}
                  fill="none"
                  stroke="#f472b6"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                />
              )}
            </svg>

            {/* RENDERIZAÇÃO DINÂMICA DE TODAS AS CAIXAS DO FLUXO */}
            {nodes.map((node) => {
              const meta = NODE_KIND_META[node.kind];
              const isSelected = selectedNodeId === node.id;
              const isSimHit = activeSimNodeIds.includes(node.id);

              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => startDraggingNode(e, node.id)}
                  onPointerUp={(e) => finishConnectionOnNode(e, node.id)}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_WIDTH,
                  }}
                  className={`group absolute rounded-2xl border bg-[#141724] p-4 shadow-2xl transition-colors ${
                    isSelected ? meta.activeRing : meta.borderColor
                  } ${isSimHit ? "ring-4 ring-emerald-400" : ""}`}
                >
                  {/* BOLINHA DE ENTRADA (ESQUERDA) — SOLTE O CONECTOR AQUI */}
                  {node.kind !== "trigger" && (
                    <div
                      onPointerUp={(e) => finishConnectionOnNode(e, node.id)}
                      title="Entrada da caixa (solte um conector aqui)"
                      className="absolute -left-3 top-[60px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white/40 bg-[#141724] text-[10px] text-white shadow transition hover:scale-125 hover:border-pink-400"
                    >
                      ●
                    </div>
                  )}

                  {/* BOLINHA(S) DE SAÍDA (DIREITA) — ARRASTE DAQUI PARA OUTRA CAIXA */}
                  {node.kind === "follow_gate" ? (
                    <>
                      <div
                        onPointerDown={(e) => startStartingConnection(e, node.id, "yes")}
                        title="Arraste daqui para ligar a saída '✓ SIM, Segue'"
                        className="absolute -right-3.5 top-[52px] flex h-7 w-7 cursor-crosshair items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-950 text-[10px] font-bold text-emerald-300 shadow-lg transition hover:scale-125"
                      >
                        ✓
                      </div>
                      <div
                        onPointerDown={(e) => startStartingConnection(e, node.id, "no")}
                        title="Arraste daqui para ligar a saída '✕ NÃO Segue'"
                        className="absolute -right-3.5 top-[120px] flex h-7 w-7 cursor-crosshair items-center justify-center rounded-full border-2 border-amber-400 bg-amber-950 text-[10px] font-bold text-amber-300 shadow-lg transition hover:scale-125"
                      >
                        ✕
                      </div>
                    </>
                  ) : (
                    <div
                      onPointerDown={(e) => startStartingConnection(e, node.id, "out")}
                      title="Arraste esta bolinha até outra caixa para conectar!"
                      className="absolute -right-3 top-[60px] flex h-6 w-6 cursor-crosshair items-center justify-center rounded-full border-2 border-pink-400 bg-[#141724] text-[10px] text-pink-300 shadow-lg transition hover:scale-125 hover:bg-pink-500 hover:text-white"
                    >
                      ●
                    </div>
                  )}

                  {/* CABEÇALHO DA CAIXA COM DUPLICAR E EXCLUIR */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs">
                        {meta.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-display text-xs font-bold text-white">
                          {node.title}
                        </p>
                        <p className="truncate text-[10px] text-zinc-400">{meta.subtitle}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${meta.badgeBg}`}
                      >
                        {meta.badge}
                      </span>
                      {node.kind !== "trigger" && (
                        <>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateBox(node);
                            }}
                            className="rounded p-1 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-white"
                            title="Duplicar esta caixa"
                          >
                            📄
                          </button>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBox(node.id);
                            }}
                            className="rounded p-1 text-[11px] text-zinc-400 hover:bg-red-500/20 hover:text-red-300"
                            title="Excluir esta caixa"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* CONTEÚDO RESUMIDO DA CAIXA */}
                  <div className="mt-3 space-y-2 text-xs">
                    {node.kind === "trigger" ? (
                      <>
                        <div className="flex items-center justify-between rounded-lg bg-black/40 px-2.5 py-1.5">
                          <span className="text-zinc-400">Conta:</span>
                          <strong className="text-pink-300">
                            @{selectedAccountObj?.username || "grupomercatta"}
                          </strong>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-2 text-zinc-200 font-medium">
                          {triggerType === "comment"
                            ? "💬 Comentário em Reel ou Post"
                            : triggerType === "dm"
                              ? "📩 Mensagem no Direct (DM)"
                              : "⚡ Comentário, Direct ou Story"}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {matchMode === "any_comment" ? (
                            <span className="rounded-lg bg-pink-500/20 px-2 py-0.5 text-[11px] font-semibold text-pink-200">
                              Qualquer comentário
                            </span>
                          ) : (
                            parsedKeywords.slice(0, 6).map((kw) => (
                              <span
                                key={kw}
                                className="rounded-lg border border-pink-500/40 bg-pink-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-pink-200"
                              >
                                {kw}
                              </span>
                            ))
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {node.text && (
                          <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 text-zinc-200 line-clamp-3 leading-relaxed">
                            {node.text}
                          </div>
                        )}
                        {node.buttonTitle && (
                          <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-center text-[11px] font-bold text-white">
                            🔘 {node.buttonTitle}
                          </div>
                        )}
                        {node.kind === "delay" && (
                          <div className="rounded-xl bg-sky-500/15 px-3 py-1.5 text-center text-[11px] font-bold text-sky-200">
                            ⏱️ Aguardar {node.delaySeconds ?? 5} segundos
                          </div>
                        )}
                        {node.kind === "tag_crm" && (
                          <div className="rounded-xl bg-fuchsia-500/15 px-3 py-1.5 text-center font-mono text-[11px] font-bold text-fuchsia-200">
                            🏷️ #{node.tagName || "LEAD_VIP"}
                          </div>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNodeId(node.id);
                        setDrawerMode("inspector");
                      }}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 py-1.5 text-center text-[11px] font-semibold text-zinc-200 transition hover:bg-pink-500/20 hover:border-pink-500/40"
                    >
                      ✏️ Editar esta Caixa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* GAVETA LATERAL DIREITA (PODE SER ENCOLHIDA PARA A DIREITA) */}
        {drawerMode !== "closed" && (
          <div className="relative z-30 flex h-full">
            <button
              type="button"
              onClick={() => setDrawerMode("closed")}
              className="absolute -left-8 top-1/2 -translate-y-1/2 z-40 flex h-24 w-8 flex-col items-center justify-center gap-1 rounded-l-2xl border border-r-0 border-white/15 bg-[#141726] text-xs font-bold text-zinc-200 shadow-2xl transition hover:border-pink-500/50 hover:bg-pink-500/20 hover:text-white"
              title="Encolher aba para a direita"
            >
              <span className="text-sm text-pink-400">❯</span>
            </button>

            <aside className="flex h-full w-full max-w-[27rem] min-w-[24rem] flex-col justify-between border-l border-white/10 bg-[#11131d] p-5 shadow-2xl overflow-y-auto">
              <div className="space-y-5">
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
                      ⚙️ Editar Caixa
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
                    className="inline-flex items-center gap-1 rounded-lg border border-pink-500/40 bg-pink-500/15 px-3 py-1.5 text-xs font-bold text-pink-200 transition hover:bg-pink-500/30 hover:text-white"
                  >
                    Encolher ❯
                  </button>
                </div>

                {/* MODO 1: EDITOR COMPLETO DA CAIXA SELECIONADA + CONEXÕES */}
                {drawerMode === "inspector" && selectedNode && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-300">
                        Nome do Fluxo de Automação
                      </label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} />
                    </div>

                    {/* Lista rápida das caixas criadas no fluxo */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Caixas no seu fluxo ({nodes.length}):
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {nodes.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => setSelectedNodeId(n.id)}
                            className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                              selectedNodeId === n.id
                                ? "border-pink-500 bg-pink-500/20 text-white"
                                : "border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                            }`}
                          >
                            {NODE_KIND_META[n.kind].icon} {n.title}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Card de edição da caixa selecionada */}
                    <div className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-sm font-bold text-white">
                          {NODE_KIND_META[selectedNode.kind].icon} Editando:{" "}
                          {selectedNode.title}
                        </h3>
                        {selectedNode.kind !== "trigger" && (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => duplicateBox(selectedNode)}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/15"
                            >
                              📄 Duplicar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteBox(selectedNode.id)}
                              className="rounded-lg border border-red-500/30 bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/30"
                            >
                              🗑️ Excluir
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-zinc-300">
                          Título desta Caixa
                        </label>
                        <Input
                          value={selectedNode.title}
                          onChange={(e) =>
                            updateNode(selectedNode.id, { title: e.target.value })
                          }
                        />
                      </div>

                      {selectedNode.kind === "trigger" && (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-zinc-300">
                              Quando disparar?
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
                              Regra das palavras-chave
                            </label>
                            <select
                              value={matchMode}
                              onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                              className="h-10 w-full rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs font-semibold text-white"
                            >
                              <option value="contains">Contém a palavra-chave</option>
                              <option value="exact">Exatamente igual à palavra-chave</option>
                              <option value="any_comment">
                                Qualquer comentário ou mensagem
                              </option>
                            </select>
                          </div>

                          {matchMode !== "any_comment" && (
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-zinc-300">
                                Palavras-chave ativas:
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
                              <div className="flex gap-2">
                                <Input
                                  value={newKeywordInput}
                                  onChange={(e) => setNewKeywordInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addKeywordChip();
                                    }
                                  }}
                                  placeholder="Ex.: EU QUERO"
                                />
                                <Button type="button" variant="outline" onClick={addKeywordChip}>
                                  + Adicionar
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {selectedNode.kind !== "trigger" && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-zinc-300">
                            {selectedNode.kind === "comment_reply"
                              ? "Frases de resposta no comentário (uma por linha):"
                              : "Mensagem / Texto desta caixa (use {nome} e {conta}):"}
                          </label>
                          <textarea
                            rows={4}
                            value={selectedNode.text ?? ""}
                            onChange={(e) =>
                              updateNode(selectedNode.id, { text: e.target.value })
                            }
                            className="w-full rounded-xl border border-white/15 bg-[#181b26] p-3 text-xs text-white focus:border-pink-400 focus:outline-none leading-relaxed"
                          />
                        </div>
                      )}

                      {(selectedNode.kind === "dm_message" ||
                        selectedNode.kind === "follow_gate") && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-zinc-300">
                            Texto do Botão:
                          </label>
                          <Input
                            value={selectedNode.buttonTitle ?? ""}
                            onChange={(e) =>
                              updateNode(selectedNode.id, { buttonTitle: e.target.value })
                            }
                            placeholder="Ex.: Abrir Acesso Exclusivo 🚀"
                          />
                        </div>
                      )}

                      {selectedNode.kind === "dm_message" && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-zinc-300">
                            Link (URL) do Botão (opcional):
                          </label>
                          <Input
                            value={selectedNode.buttonUrl ?? ""}
                            onChange={(e) =>
                              updateNode(selectedNode.id, { buttonUrl: e.target.value })
                            }
                            placeholder="https://..."
                          />
                        </div>
                      )}

                      {selectedNode.kind === "lead_capture" && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-zinc-300">
                            Qual dado salvar no CRM?
                          </label>
                          <select
                            value={selectedNode.leadField ?? "whatsapp"}
                            onChange={(e) =>
                              updateNode(selectedNode.id, {
                                leadField: e.target.value as CustomFlowNode["leadField"],
                              })
                            }
                            className="h-10 w-full rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs font-semibold text-white"
                          >
                            <option value="whatsapp">📱 WhatsApp com DDD</option>
                            <option value="email">📧 E-mail</option>
                            <option value="name">👤 Nome do Cliente</option>
                            <option value="custom">💬 Resposta Livre</option>
                          </select>
                        </div>
                      )}

                      {selectedNode.kind === "delay" && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-zinc-300">
                            Tempo de espera (em segundos):
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={3600}
                            value={String(selectedNode.delaySeconds ?? 5)}
                            onChange={(e) =>
                              updateNode(selectedNode.id, {
                                delaySeconds: Math.max(1, Number(e.target.value) || 5),
                              })
                            }
                          />
                        </div>
                      )}

                      {selectedNode.kind === "tag_crm" && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-zinc-300">
                            Nome da Etiqueta (Tag no CRM):
                          </label>
                          <Input
                            value={selectedNode.tagName ?? ""}
                            onChange={(e) =>
                              updateNode(selectedNode.id, {
                                tagName: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="Ex.: VIP_INTERESSADO"
                          />
                        </div>
                      )}

                      {/* CONEXÃO: ESCOLHER PARA QUAL CAIXA ESTA CAIXA VAI (ALÉM DE ARRASTAR COM O MOUSE) */}
                      <div className="border-t border-white/10 pt-3 space-y-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-pink-300">
                          🔗 Conexão desta Caixa (Próximo Passo):
                        </p>

                        {selectedNode.kind === "follow_gate" ? (
                          <>
                            <div className="space-y-1">
                              <label className="text-xs text-emerald-300 font-semibold">
                                Saída 1 (✓ SIM, Já Segue) → Vai para:
                              </label>
                              <select
                                value={
                                  edges.find(
                                    (e) =>
                                      e.from === selectedNode.id && e.fromPort === "yes",
                                  )?.to ?? ""
                                }
                                onChange={(e) =>
                                  connectNodes(selectedNode.id, "yes", e.target.value)
                                }
                                className="h-9 w-full rounded-xl border border-emerald-500/40 bg-[#181b26] px-3 text-xs text-white"
                              >
                                <option value="">— Nenhuma (Desconectado) —</option>
                                {nodes
                                  .filter((n) => n.id !== selectedNode.id && n.kind !== "trigger")
                                  .map((n) => (
                                    <option key={n.id} value={n.id}>
                                      {NODE_KIND_META[n.kind].icon} {n.title}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs text-amber-300 font-semibold">
                                Saída 2 (✕ NÃO Segue) → Vai para:
                              </label>
                              <select
                                value={
                                  edges.find(
                                    (e) =>
                                      e.from === selectedNode.id && e.fromPort === "no",
                                  )?.to ?? ""
                                }
                                onChange={(e) =>
                                  connectNodes(selectedNode.id, "no", e.target.value)
                                }
                                className="h-9 w-full rounded-xl border border-amber-500/40 bg-[#181b26] px-3 text-xs text-white"
                              >
                                <option value="">— Nenhuma (Desconectado) —</option>
                                {nodes
                                  .filter((n) => n.id !== selectedNode.id && n.kind !== "trigger")
                                  .map((n) => (
                                    <option key={n.id} value={n.id}>
                                      {NODE_KIND_META[n.kind].icon} {n.title}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-xs text-zinc-300">
                              Ao terminar esta caixa → Ir para:
                            </label>
                            <select
                              value={
                                edges.find(
                                  (e) =>
                                    e.from === selectedNode.id && e.fromPort === "out",
                                )?.to ?? ""
                              }
                              onChange={(e) =>
                                connectNodes(selectedNode.id, "out", e.target.value)
                              }
                              className="h-9 w-full rounded-xl border border-white/15 bg-[#181b26] px-3 text-xs text-white"
                            >
                              <option value="">— Fim do Fluxo (Sem próxima caixa) —</option>
                              {nodes
                                .filter((n) => n.id !== selectedNode.id && n.kind !== "trigger")
                                .map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {NODE_KIND_META[n.kind].icon} {n.title}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
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
                            Clique no botão acima para ver seu fluxo responder em tempo real!
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
                            <strong className="text-white">
                              @{s.igUsername || s.igSenderId}
                            </strong>
                            <Badge tone={s.stage === "delivered" ? "success" : "warn"}>
                              {s.stage === "delivered" ? "Entregue ✓" : "Na Trava"}
                            </Badge>
                          </div>
                          <p className="text-zinc-400">
                            Comentou:{" "}
                            <span className="font-mono text-zinc-200">{s.triggerText}</span>
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
          </div>
        )}
      </div>
    </div>
  );
}
