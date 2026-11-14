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
import { Alert, Input, Spinner } from "@/components/ui";

const NODE_WIDTH = 304;

/* Ícones vetoriais minimalistas (estilo Linear / Stripe Workflows) */
function NodeKindIcon({ kind, className = "h-4 w-4" }: { kind: CustomNodeKind; className?: string }) {
  switch (kind) {
    case "trigger":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "comment_reply":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "follow_gate":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <polyline points="16 11 18 13 22 9" />
        </svg>
      );
    case "not_following":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case "lead_capture":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="7" y1="9" x2="17" y2="9" />
          <line x1="7" y1="13" x2="13" y2="13" />
        </svg>
      );
    case "dm_message":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      );
    case "delay":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "tag_crm":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
  }
}

const NODE_KIND_META: Record<
  CustomNodeKind,
  {
    category: string;
    defaultTitle: string;
    subtitle: string;
    accentText: string;
    iconBg: string;
    edgeColor: string;
  }
> = {
  trigger: {
    category: "Gatilho",
    defaultTitle: "Gatilho de Entrada",
    subtitle: "Inicia quando o cliente interage",
    accentText: "text-indigo-400",
    iconBg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    edgeColor: "#6366f1",
  },
  comment_reply: {
    category: "Comentário",
    defaultTitle: "Resposta no Comentário",
    subtitle: "Responde publicamente no Reel/Post",
    accentText: "text-sky-400",
    iconBg: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    edgeColor: "#38bdf8",
  },
  follow_gate: {
    category: "Condição",
    defaultTitle: "Verificação de Seguidor",
    subtitle: "Valida na API Meta se segue a conta",
    accentText: "text-emerald-400",
    iconBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    edgeColor: "#10b981",
  },
  not_following: {
    category: "Retenção",
    defaultTitle: "Aviso de Não Seguidor",
    subtitle: "Solicita seguir antes de liberar",
    accentText: "text-amber-400",
    iconBg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    edgeColor: "#f59e0b",
  },
  lead_capture: {
    category: "Captura",
    defaultTitle: "Captura de Contato",
    subtitle: "Coleta WhatsApp ou e-mail no Direct",
    accentText: "text-cyan-400",
    iconBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    edgeColor: "#06b6d4",
  },
  dm_message: {
    category: "Direct",
    defaultTitle: "Entrega via Direct",
    subtitle: "Envia mensagem direta e botão de ação",
    accentText: "text-violet-400",
    iconBg: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    edgeColor: "#8b5cf6",
  },
  delay: {
    category: "Temporizador",
    defaultTitle: "Espera Programada",
    subtitle: "Aguarda intervalo antes de prosseguir",
    accentText: "text-slate-300",
    iconBg: "bg-slate-500/10 text-slate-300 border-slate-500/20",
    edgeColor: "#64748b",
  },
  tag_crm: {
    category: "CRM",
    defaultTitle: "Classificar Lead",
    subtitle: "Registra etiqueta no histórico",
    accentText: "text-fuchsia-400",
    iconBg: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
    edgeColor: "#d946ef",
  },
};

const PRESET_TEMPLATES = [
  {
    id: "reel_lead_magnet",
    badge: "Isca Digital (Reels)",
    title: "Isca Digital nos Reels — Validação de Seguidor",
    triggerType: "comment" as TriggerType,
    matchMode: "contains" as MatchMode,
    keywords: ["QUERO", "EU QUERO", "LINK", "ACESSO", "MATERIAL"],
    replyToComment: true,
    commentReplies: [
      "Acabei de enviar os detalhes no seu Direct. Confira suas mensagens.",
      "Enviado para você no Direct agora mesmo.",
      "Te chamei na DM com o link de acesso.",
    ],
    requireFollow: true,
    followGateMessage:
      "Olá, {nome}. Recebi seu comentário.\n\nPara liberar o seu acesso exclusivo, confirme que você já segue o perfil {conta} tocando no botão abaixo:",
    followGateButtonLabel: "Já sigo, liberar acesso",
    notFollowingMessage:
      "Verificamos que você ainda não segue o perfil {conta}.\n\n1. Acesse {conta} e toque em Seguir\n2. Volte nesta conversa e toque no botão abaixo para liberar imediatamente.",
    collectLeadField: "none" as CollectLeadField,
    collectLeadPrompt: "",
    dmMessage:
      "Inscrição confirmada como seguidor.\n\nSeu acesso está disponível no botão abaixo:",
    dmButtonTitle: "Acessar conteúdo",
    dmButtonUrl: "https://grupomercatta.com.br",
  },
  {
    id: "whatsapp_capture",
    badge: "Qualificação WhatsApp",
    title: "Qualificação Comercial — Captura de WhatsApp no Direct",
    triggerType: "any" as TriggerType,
    matchMode: "contains" as MatchMode,
    keywords: ["ORCAMENTO", "CONSULTORIA", "VIP", "PRECO", "CONTATO"],
    replyToComment: true,
    commentReplies: [
      "Enviamos as informações comerciais no seu Direct.",
      "Acabei de te chamar no Direct para dar andamento ao seu atendimento.",
    ],
    requireFollow: true,
    followGateMessage:
      "Olá, {nome}.\n\nAntes de enviar a proposta comercial, siga nosso perfil {conta} e confirme no botão abaixo:",
    followGateButtonLabel: "Já sigo, continuar",
    notFollowingMessage:
      "Ainda não identificamos você entre os seguidores de {conta}. Siga o perfil e clique novamente abaixo para prosseguir.",
    collectLeadField: "whatsapp" as CollectLeadField,
    collectLeadPrompt:
      "Perfeito. Informe seu número de WhatsApp com DDD (ex.: 11999999999) para registrarmos seu atendimento:",
    dmMessage:
      "Seu contato foi registrado para atendimento prioritário. Você também pode iniciar a conversa diretamente abaixo:",
    dmButtonTitle: "Abrir atendimento",
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
      title: "Gatilho de Entrada",
      x: 56,
      y: 180,
    },
  ];
  const edges: CustomFlowEdge[] = [];

  if (cfg.replyToComment) {
    nodes.push({
      id: "comment_reply",
      kind: "comment_reply",
      title: "Resposta no Comentário",
      x: 420,
      y: 44,
      commentReplies: cfg.commentReplies,
      text: cfg.commentReplies.join("\n"),
    });
  }

  if (cfg.requireFollow) {
    nodes.push({
      id: "follow_gate",
      kind: "follow_gate",
      title: "Verificação de Seguidor",
      x: 420,
      y: 256,
      text: cfg.followGateMessage,
      buttonTitle: cfg.followGateButtonLabel,
    });
    nodes.push({
      id: "not_following",
      kind: "not_following",
      title: "Aviso de Não Seguidor",
      x: 800,
      y: 420,
      text: cfg.notFollowingMessage,
    });
  }

  if (cfg.collectLeadField !== "none") {
    nodes.push({
      id: "lead_capture",
      kind: "lead_capture",
      title: cfg.collectLeadField === "email" ? "Solicitar E-mail" : "Solicitar WhatsApp",
      x: 800,
      y: 170,
      leadField: cfg.collectLeadField,
      text:
        cfg.collectLeadPrompt ||
        "Informe seu WhatsApp com DDD (ex.: 11999999999) para liberar seu acesso:",
    });
  }

  const dmX = cfg.collectLeadField !== "none" ? 1170 : cfg.requireFollow ? 800 : 420;
  nodes.push({
    id: "dm_delivery",
    kind: "dm_message",
    title: "Entrega via Direct",
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
      color: "#6366f1",
      label: "Responde comentário",
    });
    edges.push({
      id: "e-comment-next",
      from: "comment_reply",
      fromPort: "out",
      to: firstDmTarget,
      color: "#38bdf8",
      label: "Inicia Direct",
    });
  } else {
    edges.push({
      id: "e-trigger-direct",
      from: "trigger",
      fromPort: "out",
      to: firstDmTarget,
      color: "#6366f1",
      label: "Inicia Direct",
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
      label: "Segue a conta",
    });
    edges.push({
      id: "e-follow-no",
      from: "follow_gate",
      fromPort: "no",
      to: "not_following",
      color: "#f59e0b",
      label: "Não segue",
    });
  }

  if (cfg.collectLeadField !== "none") {
    edges.push({
      id: "e-lead-dm",
      from: "lead_capture",
      fromPort: "out",
      to: "dm_delivery",
      color: "#06b6d4",
      label: "Contato salvo",
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
  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 32, y: 32 });

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

  function addNewBox(kind: CustomNodeKind) {
    const meta = NODE_KIND_META[kind];
    const id = `${kind}_${Date.now().toString(36)}`;
    const maxRight = nodes.reduce((max, n) => Math.max(max, n.x), 80);
    const newX = Math.min(1280, maxRight + 350);
    const newY = 140 + ((nodes.length * 55) % 260);

    const newNode: CustomFlowNode = {
      id,
      kind,
      title: meta.defaultTitle,
      x: newX,
      y: newY,
      ...(kind === "comment_reply"
        ? {
            text: "Acabei de enviar os detalhes no seu Direct.\nEnviado na sua DM agora mesmo.",
            commentReplies: [
              "Acabei de enviar os detalhes no seu Direct.",
              "Enviado na sua DM agora mesmo.",
            ],
          }
        : {}),
      ...(kind === "follow_gate"
        ? {
            text: "Olá, {nome}. Para liberar seu acesso exclusivo, confirme que você já segue o perfil {conta} no botão abaixo:",
            buttonTitle: "Já sigo, liberar acesso",
          }
        : {}),
      ...(kind === "not_following"
        ? {
            text: "Ainda não identificamos você como seguidor de {conta}. Siga o perfil e toque novamente no botão de confirmação.",
          }
        : {}),
      ...(kind === "lead_capture"
        ? {
            leadField: "whatsapp",
            text: "Informe seu número de WhatsApp com DDD (ex.: 11999999999) para liberar o link:",
          }
        : {}),
      ...(kind === "dm_message"
        ? {
            text: "Aqui está o seu acesso exclusivo. Utilize o botão abaixo para abrir:",
            buttonTitle: "Acessar conteúdo",
            buttonUrl: "https://grupomercatta.com.br",
          }
        : {}),
      ...(kind === "delay"
        ? {
            delaySeconds: 5,
            text: "Aguarda 5 segundos antes de executar a próxima etapa",
          }
        : {}),
      ...(kind === "tag_crm"
        ? {
            tagName: "QUALIFICADO",
            text: "Aplica etiqueta QUALIFICADO ao contato no CRM",
          }
        : {}),
    };

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
                ? "Segue a conta"
                : port === "no"
                  ? "Não segue"
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
      x: node.x + 36,
      y: node.y + 36,
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
        ? "Segue a conta"
        : fromPort === "no"
          ? "Não segue"
          : undefined;

    setEdges((prev) => {
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
    setName("Novo Fluxo Corporativo");
    const blankTrigger: CustomFlowNode = {
      id: "trigger",
      kind: "trigger",
      title: "Gatilho de Entrada",
      x: 80,
      y: 200,
    };
    setNodes([blankTrigger]);
    setEdges([]);
    setSelectedNodeId("trigger");
    setDrawerMode("inspector");
    setSuccessMsg(
      "Fluxo em branco iniciado. Adicione etapas na barra superior do canvas e conecte os pontos de saída.",
    );
  }

  function autoArrangeLayout() {
    const triggerNode = nodes.find((n) => n.kind === "trigger") ?? nodes[0];
    if (!triggerNode) return;
    const others = nodes.filter((n) => n.id !== triggerNode.id);
    const updated: CustomFlowNode[] = [
      { ...triggerNode, x: 56, y: 200 },
      ...others.map((n, idx) => {
        const col = Math.floor(idx / 2) + 1;
        const row = idx % 2;
        return {
          ...n,
          x: 56 + col * 372,
          y: others.length === 1 ? 200 : row === 0 ? 72 : 340,
        };
      }),
    ];
    setNodes(updated);
    setZoom(0.9);
    setPan({ x: 32, y: 32 });
  }

  function getPortCoords(
    nodeId: string,
    port: "in" | "out" | "yes" | "no",
  ): { x: number; y: number } {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    if (port === "in") {
      return { x: node.x, y: node.y + 64 };
    }
    if (node.kind === "follow_gate") {
      if (port === "yes") return { x: node.x + NODE_WIDTH, y: node.y + 58 };
      if (port === "no") return { x: node.x + NODE_WIDTH, y: node.y + 118 };
    }
    return { x: node.x + NODE_WIDTH, y: node.y + 64 };
  }

  function makeBezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(72, Math.abs(x2 - x1) * 0.46);
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
    setSuccessMsg(`Modelo "${tpl.badge}" aplicado ao canvas.`);
  }

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
        : "Olá. Aqui está o seu link de acesso.";

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
          : ["Acabei de enviar os detalhes no seu Direct."],
      requireFollow: Boolean(followNode),
      followGateMessage:
        followNode?.text ||
        "Olá, {nome}. Siga o perfil {conta} e confirme no botão abaixo para liberar seu acesso:",
      followGateButtonLabel: followNode?.buttonTitle || "Já sigo, liberar acesso",
      notFollowingMessage:
        notFollowNode?.text ||
        "Ainda não identificamos você como seguidor de {conta}. Siga o perfil e confirme abaixo.",
      collectLeadField: leadField,
      collectLeadPrompt: leadNode?.text || "",
      dmMessage: combinedDmMessages,
      dmButtonTitle: lastDmNode?.buttonTitle || "Acessar conteúdo",
      dmButtonUrl: lastDmNode?.buttonUrl || "",
    };
  }

  async function handleSaveAutomation() {
    if (!accountId) {
      setError("Selecione uma conta do Instagram antes de publicar.");
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
        setError(data.error ?? "Não foi possível salvar o fluxo.");
        return;
      }
      setSelectedAutoId(data.automation.id);
      setSuccessMsg(`Fluxo "${data.automation.name}" publicado.`);
      router.refresh();
    } finally {
      setBusySave(false);
    }
  }

  async function handleRunSimulation(action: "trigger" | "check_follow" | "submit_lead") {
    const targetAutoId = selectedAutoId !== "new" ? selectedAutoId : initialAutomations[0]?.id;
    if (!targetAutoId) {
      setError("Salve e publique o fluxo antes de iniciar a simulação.");
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
            ? "Já sigo, liberar acesso"
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
        setError(data.error ?? "Falha ao executar simulação.");
        return;
      }

      setSimSessionId(data.session.id);
      setSimStage(data.session.stage);

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
        setError(data.error ?? "Não foi possível sincronizar comentários.");
        return;
      }
      setSuccessMsg(
        `${data.checkedMedia ?? 0} publicações inspecionadas · ${data.triggeredCount ?? 0} novas interações processadas.`,
      );
      router.refresh();
    } finally {
      setBusySync(false);
    }
  }

  return (
    /* ENTERPRISE WORKSPACE — ARQUITETURA OBSIDIAN & GRAFITE (#090A0F / #11131A) */
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] -my-8 flex h-[calc(100dvh-4rem)] min-h-[780px] w-screen flex-col overflow-hidden bg-[#090A0F] text-[#F1F5F9] antialiased">
      {/* BARRA DE COMANDO CORPORATIVA (ALTURA 52PX, BORDAS 1PX PRECISAS) */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#11131A] px-5 py-2.5">
        {/* Esquerda: Identidade do Fluxo + Conta Conectada + Modelos */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400" title="Motor de automação online" />
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
              className="h-8 max-w-[18rem] rounded-lg border border-white/[0.09] bg-[#171A24] px-3 text-xs font-medium text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              {initialAutomations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name.replace(/^[^\wÀ-ú]+/, "")}
                </option>
              ))}
              <option value="new">+ Novo fluxo em branco...</option>
            </select>
          </div>

          <button
            type="button"
            onClick={startBlankCustomFlow}
            className="h-8 rounded-lg border border-white/[0.09] bg-[#171A24] px-3 text-xs font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            Novo fluxo
          </button>

          {/* Seletor de Conta */}
          <div className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.09] bg-[#171A24] px-3">
            <span className="text-[11px] text-slate-400">Conta</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="bg-transparent font-mono text-xs font-medium text-indigo-300 focus:outline-none"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-[#171A24] text-slate-100">
                  @{acc.username || acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Modelos base */}
          <div className="hidden 2xl:flex items-center gap-1.5 border-l border-white/[0.07] pl-3">
            <span className="text-[11px] text-slate-500">Modelos:</span>
            {PRESET_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyPresetTemplate(tpl)}
                className="rounded-md border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
              >
                {tpl.badge}
              </button>
            ))}
          </div>
        </div>

        {/* Direita: Telemetria Discreta + Navegação de Painel + Ação Primária */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="hidden xl:flex items-center gap-3 rounded-lg border border-white/[0.07] bg-[#0D0F16] px-3 py-1.5 text-[11px] text-slate-400">
            <span>
              Disparos <strong className="ml-1 font-mono text-slate-200">{totals.triggers}</strong>
            </span>
            <span className="h-3 w-px bg-white/[0.08]" />
            <span>
              Directs <strong className="ml-1 font-mono text-slate-200">{totals.dms}</strong>
            </span>
            <span className="h-3 w-px bg-white/[0.08]" />
            <span>
              Novos seguidores{" "}
              <strong className="ml-1 font-mono text-emerald-400">+{totals.followers}</strong>
            </span>
          </div>

          {/* Controle Segmentado do Painel Lateral */}
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#0D0F16] p-0.5">
            <button
              type="button"
              onClick={() => setDrawerMode(drawerMode === "inspector" ? "closed" : "inspector")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                drawerMode === "inspector"
                  ? "bg-[#1E2230] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Propriedades
            </button>
            <button
              type="button"
              onClick={() => setDrawerMode(drawerMode === "simulator" ? "closed" : "simulator")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                drawerMode === "simulator"
                  ? "bg-[#1E2230] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Simulador
            </button>
            <button
              type="button"
              onClick={() => setDrawerMode(drawerMode === "crm" ? "closed" : "crm")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                drawerMode === "crm"
                  ? "bg-[#1E2230] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Leads ({initialSessions.length})
            </button>
          </div>

          <button
            type="button"
            disabled={busySync}
            onClick={handleSyncRealComments}
            className="h-8 rounded-lg border border-white/[0.09] bg-[#171A24] px-3 text-xs font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-50"
          >
            {busySync ? "Sincronizando..." : "Sincronizar comentários"}
          </button>

          <button
            type="button"
            disabled={busySave}
            onClick={handleSaveAutomation}
            className="inline-flex h-8 items-center gap-2 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {busySave && <Spinner />}
            Salvar e publicar
          </button>
        </div>
      </header>

      {/* Notificações de Sistema */}
      {(error || successMsg) && (
        <div
          onClick={() => {
            setError(null);
            setSuccessMsg(null);
          }}
          className="cursor-pointer absolute bottom-16 left-1/2 z-50 -translate-x-1/2 max-w-lg w-full px-4"
        >
          {error && <Alert>{error}</Alert>}
          {successMsg && <Alert tone="success">{successMsg}</Alert>}
        </div>
      )}

      {/* ÁREA DE TRABALHO: CANVAS INFINITO + INSPETOR LATERAL COLAPSÁVEL */}
      <div className="relative flex h-[calc(100dvh-7.5rem)] min-h-[700px] w-full flex-1 overflow-hidden">
        {/* DOCK FLUTUANTE DE ETAPAS (DESIGN SÓBRIO E CORPORATIVO) */}
        <div className="absolute left-5 top-4 z-30 flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-[#11131A]/95 p-1.5 shadow-2xl backdrop-blur-md">
          <span className="px-2.5 text-[11px] font-medium text-slate-400">Adicionar etapa</span>
          <div className="h-4 w-px bg-white/[0.08] mr-1" />

          {(
            [
              { kind: "comment_reply", label: "Resposta Comentário" },
              { kind: "dm_message", label: "Mensagem Direct" },
              { kind: "follow_gate", label: "Verificador Seguidor" },
              { kind: "not_following", label: "Aviso Não Segue" },
              { kind: "lead_capture", label: "Captura de Lead" },
              { kind: "delay", label: "Espera" },
              { kind: "tag_crm", label: "Tag CRM" },
            ] as const
          ).map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => addNewBox(item.kind)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
            >
              <span className={NODE_KIND_META[item.kind].accentText}>
                <NodeKindIcon kind={item.kind} className="h-3.5 w-3.5" />
              </span>
              {item.label}
            </button>
          ))}

          <div className="h-4 w-px bg-white/[0.08] mx-1" />

          <button
            type="button"
            onClick={autoArrangeLayout}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            Alinhar grade
          </button>
        </div>

        {/* BARRA DE ZOOM DE PRECISÃO NO RODAPÉ CENTRAL */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#11131A]/95 px-3 py-1.5 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => applyZoomDelta(-0.12)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.07] bg-[#171A24] text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white"
            title="Reduzir zoom"
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
            className="h-1 w-24 cursor-pointer accent-indigo-500"
          />
          <span className="min-w-[3rem] text-center font-mono text-[11px] font-medium text-slate-200">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => applyZoomDelta(0.12)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.07] bg-[#171A24] text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white"
            title="Aumentar zoom"
          >
            +
          </button>
          <div className="h-4 w-px bg-white/[0.08] mx-0.5" />
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 32, y: 32 });
            }}
            className="rounded-md px-2 py-1 font-mono text-[11px] text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-200"
          >
            100%
          </button>
          <button
            type="button"
            onClick={autoArrangeLayout}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            Enquadrar
          </button>
        </div>

        {/* ALÇA DISCRETA NA BORDA DIREITA QUANDO O PAINEL ESTÁ RECOLHIDO */}
        {drawerMode === "closed" && (
          <button
            type="button"
            onClick={() => setDrawerMode("inspector")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-1.5 rounded-l-xl border border-r-0 border-white/[0.12] bg-[#11131A] px-2.5 py-4 text-xs font-medium text-slate-300 shadow-2xl transition hover:border-indigo-500/50 hover:text-white"
            title="Expandir painel de propriedades"
          >
            <span className="text-indigo-400">❮</span>
            <span className="[writing-mode:vertical-rl] rotate-180 tracking-wide text-[11px] font-medium text-slate-300">
              Propriedades
            </span>
          </button>
        )}

        {/* CANVAS INFINITO ARQUITETURAL */}
        <div
          ref={canvasViewportRef}
          onPointerDown={startPanningCanvas}
          className="relative h-full min-h-[700px] flex-1 cursor-grab select-none overflow-hidden active:cursor-grabbing"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)",
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
            {/* CONECTORES VETORIAIS DE PRECISÃO */}
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
                const color = edge.color || "#6366f1";
                const isSimActive =
                  activeSimNodeIds.includes(edge.from) && activeSimNodeIds.includes(edge.to);

                return (
                  <g key={edge.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeOpacity={isSimActive ? 0.35 : 0.14}
                      strokeWidth={isSimActive ? 6 : 4}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeOpacity={0.85}
                      strokeWidth={1.75}
                    />
                    <circle cx={start.x} cy={start.y} r={4} fill={color} />
                    <circle cx={end.x} cy={end.y} r={4.5} fill={color} />

                    <g
                      transform={`translate(${midX}, ${midY})`}
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEdge(edge.id);
                      }}
                    >
                      <rect
                        x={edge.label ? -64 : -12}
                        y={-10}
                        width={edge.label ? 128 : 24}
                        height={20}
                        rx={6}
                        fill="#11131A"
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fill="#CBD5E1"
                        fontSize={10}
                        fontWeight={500}
                      >
                        {edge.label ? `${edge.label}  ×` : "×"}
                      </text>
                    </g>
                  </g>
                );
              })}

              {connectingDraft && (
                <path
                  d={makeBezierPath(
                    getPortCoords(connectingDraft.fromNodeId, connectingDraft.fromPort).x,
                    getPortCoords(connectingDraft.fromNodeId, connectingDraft.fromPort).y,
                    connectingDraft.mouseX,
                    connectingDraft.mouseY,
                  )}
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              )}
            </svg>

            {/* BLOCOS DO FLUXO (DESIGN EXECUTIVO DE ALTO VALOR) */}
            {nodes.map((node) => {
              const meta = NODE_KIND_META[node.kind];
              const isSelected = selectedNodeId === node.id;
              const isSimHit = activeSimNodeIds.includes(node.id);

              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => startDraggingNode(e, node.id)}
                  onPointerUp={(e) => finishConnectionOnNode(e, node.id)}
                  onDoubleClick={() => {
                    setSelectedNodeId(node.id);
                    setDrawerMode("inspector");
                  }}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_WIDTH,
                  }}
                  className={`group absolute rounded-xl border bg-[#11131A] p-4 shadow-[0_14px_34px_-10px_rgba(0,0,0,0.65)] transition-all ${
                    isSelected
                      ? "border-indigo-500 ring-1 ring-indigo-500/40"
                      : "border-white/[0.08] hover:border-white/[0.18]"
                  } ${isSimHit ? "ring-2 ring-emerald-400" : ""}`}
                >
                  {/* Porta de Entrada */}
                  {node.kind !== "trigger" && (
                    <div
                      onPointerUp={(e) => finishConnectionOnNode(e, node.id)}
                      title="Conectar entrada"
                      className="absolute -left-2.5 top-[56px] flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-[#11131A] transition hover:scale-125 hover:border-indigo-400"
                    >
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                    </div>
                  )}

                  {/* Portas de Saída */}
                  {node.kind === "follow_gate" ? (
                    <>
                      <div
                        onPointerDown={(e) => startStartingConnection(e, node.id, "yes")}
                        title="Arraste para conectar saída: Segue a conta"
                        className="absolute -right-2.5 top-[50px] flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full border border-emerald-500/60 bg-[#11131A] transition hover:scale-125 hover:bg-emerald-500/20"
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      </div>
                      <div
                        onPointerDown={(e) => startStartingConnection(e, node.id, "no")}
                        title="Arraste para conectar saída: Não segue"
                        className="absolute -right-2.5 top-[110px] flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full border border-amber-500/60 bg-[#11131A] transition hover:scale-125 hover:bg-amber-500/20"
                      >
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                      </div>
                    </>
                  ) : (
                    <div
                      onPointerDown={(e) => startStartingConnection(e, node.id, "out")}
                      title="Arraste para conectar a próxima etapa"
                      className="absolute -right-2.5 top-[56px] flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full border border-indigo-400/60 bg-[#11131A] transition hover:scale-125 hover:bg-indigo-500/20"
                    >
                      <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    </div>
                  )}

                  {/* Cabeçalho Limpo da Etapa */}
                  <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.iconBg}`}
                      >
                        <NodeKindIcon kind={node.kind} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium text-slate-400">
                            {meta.category}
                          </span>
                        </div>
                        <p className="truncate text-xs font-semibold text-slate-100">
                          {node.title.replace(/^[^\wÀ-ú]+/, "")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNodeId(node.id);
                          setDrawerMode("inspector");
                        }}
                        className="rounded-md p-1 text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
                        title="Configurar etapa"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                      {node.kind !== "trigger" && (
                        <>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateBox(node);
                            }}
                            className="rounded-md p-1 text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
                            title="Duplicar etapa"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBox(node.id);
                            }}
                            className="rounded-md p-1 text-slate-400 transition hover:bg-red-500/15 hover:text-red-400"
                            title="Remover etapa"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Corpo do Card */}
                  <div className="mt-3 space-y-2.5 text-xs">
                    {node.kind === "trigger" ? (
                      <>
                        <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-[#0D0F16] px-2.5 py-1.5">
                          <span className="text-[11px] text-slate-400">Canal</span>
                          <span className="font-mono text-[11px] text-slate-200">
                            @{selectedAccountObj?.username || "grupomercatta"}
                          </span>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-[#0D0F16] px-2.5 py-2 text-[11px] text-slate-300">
                          {triggerType === "comment"
                            ? "Comentário em publicação ou Reel"
                            : triggerType === "dm"
                              ? "Mensagem recebida no Direct"
                              : "Comentário, Direct ou resposta de Story"}
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {matchMode === "any_comment" ? (
                            <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                              Qualquer interação
                            </span>
                          ) : (
                            parsedKeywords.slice(0, 6).map((kw) => (
                              <span
                                key={kw}
                                className="rounded-md border border-white/[0.08] bg-[#171A24] px-2 py-0.5 font-mono text-[10px] font-medium text-slate-200"
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
                          <p className="rounded-lg border border-white/[0.05] bg-[#0D0F16] p-2.5 text-[11px] leading-relaxed text-slate-300 line-clamp-3">
                            {node.text}
                          </p>
                        )}
                        {node.buttonTitle && (
                          <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#171A24] px-2.5 py-1.5 text-[11px] font-medium text-slate-200">
                            <span className="truncate">{node.buttonTitle}</span>
                            <span className="text-[10px] text-slate-500">CTA</span>
                          </div>
                        )}
                        {node.kind === "follow_gate" && (
                          <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                            <span className="text-emerald-400">● Segue a conta</span>
                            <span className="text-amber-400">● Não segue</span>
                          </div>
                        )}
                        {node.kind === "delay" && (
                          <div className="rounded-lg border border-white/[0.05] bg-[#0D0F16] px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
                            Intervalo: {node.delaySeconds ?? 5}s
                          </div>
                        )}
                        {node.kind === "tag_crm" && (
                          <div className="rounded-lg border border-white/[0.05] bg-[#0D0F16] px-2.5 py-1.5 font-mono text-[11px] text-fuchsia-300">
                            #{node.tagName || "QUALIFICADO"}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PAINEL DE PROPRIEDADES CORPORATIVO (COLAPSÁVEL PARA A DIREITA) */}
        {drawerMode !== "closed" && (
          <div className="relative z-30 flex h-full">
            <button
              type="button"
              onClick={() => setDrawerMode("closed")}
              className="absolute -left-7 top-1/2 -translate-y-1/2 z-40 flex h-20 w-7 items-center justify-center rounded-l-xl border border-r-0 border-white/[0.1] bg-[#11131A] text-xs text-slate-400 shadow-xl transition hover:border-white/25 hover:text-white"
              title="Recolher painel para a direita"
            >
              ❯
            </button>

            <aside className="flex h-full w-full max-w-[26rem] min-w-[23rem] flex-col justify-between border-l border-white/[0.08] bg-[#11131A] p-5 shadow-2xl overflow-y-auto">
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3.5">
                  <div>
                    <h2 className="text-xs font-semibold text-white">
                      {drawerMode === "inspector"
                        ? "Propriedades da Etapa"
                        : drawerMode === "simulator"
                          ? "Simulador de Execução"
                          : "Registro de Leads e Sessões"}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {drawerMode === "inspector"
                        ? "Configure parâmetros, mensagens e ramificações"
                        : drawerMode === "simulator"
                          ? "Valide o comportamento do fluxo antes de publicar"
                          : "Contatos qualificados pelas automações"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerMode("closed")}
                    className="rounded-lg border border-white/[0.08] bg-[#171A24] px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
                  >
                    Recolher ❯
                  </button>
                </div>

                {/* MODO 1: PROPRIEDADES DA ETAPA */}
                {drawerMode === "inspector" && selectedNode && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-slate-400">
                        Nome do fluxo
                      </label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-slate-400">
                        Etapa em edição ({nodes.length})
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {nodes.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => setSelectedNodeId(n.id)}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                              selectedNodeId === n.id
                                ? "border-indigo-500/60 bg-indigo-500/15 text-white"
                                : "border-white/[0.07] bg-[#171A24] text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {n.title.replace(/^[^\wÀ-ú]+/, "")}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#0D0F16] p-4">
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                        <div className="flex items-center gap-2">
                          <span className={NODE_KIND_META[selectedNode.kind].accentText}>
                            <NodeKindIcon kind={selectedNode.kind} className="h-4 w-4" />
                          </span>
                          <span className="text-xs font-semibold text-slate-100">
                            {NODE_KIND_META[selectedNode.kind].category}
                          </span>
                        </div>
                        {selectedNode.kind !== "trigger" && (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => duplicateBox(selectedNode)}
                              className="rounded-md border border-white/[0.08] bg-[#171A24] px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                            >
                              Duplicar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteBox(selectedNode.id)}
                              className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/20"
                            >
                              Remover
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-slate-300">
                          Título da etapa
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
                            <label className="text-[11px] font-medium text-slate-300">
                              Evento de origem
                            </label>
                            <select
                              value={triggerType}
                              onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                              className="h-9 w-full rounded-lg border border-white/[0.09] bg-[#171A24] px-3 text-xs text-slate-100"
                            >
                              <option value="comment">Comentário em Reel ou publicação</option>
                              <option value="dm">Mensagem recebida no Direct</option>
                              <option value="any">Comentário, Direct ou resposta de Story</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-medium text-slate-300">
                              Critério de correspondência
                            </label>
                            <select
                              value={matchMode}
                              onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                              className="h-9 w-full rounded-lg border border-white/[0.09] bg-[#171A24] px-3 text-xs text-slate-100"
                            >
                              <option value="contains">Contém qualquer palavra-chave</option>
                              <option value="exact">Correspondência exata</option>
                              <option value="any_comment">Qualquer comentário ou mensagem</option>
                            </select>
                          </div>

                          {matchMode !== "any_comment" && (
                            <div className="space-y-2">
                              <label className="text-[11px] font-medium text-slate-300">
                                Palavras-chave monitoradas
                              </label>
                              <div className="flex flex-wrap gap-1.5">
                                {parsedKeywords.map((kw) => (
                                  <span
                                    key={kw}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#171A24] px-2 py-0.5 font-mono text-[11px] text-slate-200"
                                  >
                                    {kw}
                                    <button
                                      type="button"
                                      onClick={() => removeKeywordChip(kw)}
                                      className="text-slate-400 hover:text-white"
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
                                  placeholder="Adicionar termo (ex.: ACESSO)"
                                />
                                <button
                                  type="button"
                                  onClick={addKeywordChip}
                                  className="shrink-0 rounded-lg border border-white/[0.1] bg-[#171A24] px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.08]"
                                >
                                  Incluir
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {selectedNode.kind !== "trigger" && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-slate-300">
                            {selectedNode.kind === "comment_reply"
                              ? "Respostas rotativas (uma por linha)"
                              : "Conteúdo da mensagem (variáveis: {nome}, {conta})"}
                          </label>
                          <textarea
                            rows={4}
                            value={selectedNode.text ?? ""}
                            onChange={(e) =>
                              updateNode(selectedNode.id, { text: e.target.value })
                            }
                            className="w-full rounded-lg border border-white/[0.09] bg-[#171A24] p-3 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none leading-relaxed"
                          />
                        </div>
                      )}

                      {(selectedNode.kind === "dm_message" ||
                        selectedNode.kind === "follow_gate") && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-slate-300">
                            Rótulo do botão de ação
                          </label>
                          <Input
                            value={selectedNode.buttonTitle ?? ""}
                            onChange={(e) =>
                              updateNode(selectedNode.id, { buttonTitle: e.target.value })
                            }
                            placeholder="Ex.: Acessar conteúdo"
                          />
                        </div>
                      )}

                      {selectedNode.kind === "dm_message" && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-slate-300">
                            URL de destino
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
                          <label className="text-[11px] font-medium text-slate-300">
                            Campo armazenado no CRM
                          </label>
                          <select
                            value={selectedNode.leadField ?? "whatsapp"}
                            onChange={(e) =>
                              updateNode(selectedNode.id, {
                                leadField: e.target.value as CustomFlowNode["leadField"],
                              })
                            }
                            className="h-9 w-full rounded-lg border border-white/[0.09] bg-[#171A24] px-3 text-xs text-slate-100"
                          >
                            <option value="whatsapp">Telefone / WhatsApp</option>
                            <option value="email">Endereço de e-mail</option>
                            <option value="name">Nome completo</option>
                            <option value="custom">Resposta aberta</option>
                          </select>
                        </div>
                      )}

                      {selectedNode.kind === "delay" && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-slate-300">
                            Tempo de espera (segundos)
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
                          <label className="text-[11px] font-medium text-slate-300">
                            Identificador da etiqueta
                          </label>
                          <Input
                            value={selectedNode.tagName ?? ""}
                            onChange={(e) =>
                              updateNode(selectedNode.id, {
                                tagName: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="QUALIFICADO"
                          />
                        </div>
                      )}

                      {/* Roteamento de Saída */}
                      <div className="border-t border-white/[0.06] pt-3 space-y-2.5">
                        <p className="text-[11px] font-medium text-slate-400">
                          Encaminhamento de saída
                        </p>

                        {selectedNode.kind === "follow_gate" ? (
                          <>
                            <div className="space-y-1">
                              <label className="text-[11px] text-emerald-400">
                                Se seguir a conta →
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
                                className="h-9 w-full rounded-lg border border-white/[0.09] bg-[#171A24] px-3 text-xs text-slate-100"
                              >
                                <option value="">Finalizar fluxo</option>
                                {nodes
                                  .filter((n) => n.id !== selectedNode.id && n.kind !== "trigger")
                                  .map((n) => (
                                    <option key={n.id} value={n.id}>
                                      {n.title}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] text-amber-400">
                                Se não seguir →
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
                                className="h-9 w-full rounded-lg border border-white/[0.09] bg-[#171A24] px-3 text-xs text-slate-100"
                              >
                                <option value="">Finalizar fluxo</option>
                                {nodes
                                  .filter((n) => n.id !== selectedNode.id && n.kind !== "trigger")
                                  .map((n) => (
                                    <option key={n.id} value={n.id}>
                                      {n.title}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-400">
                              Próxima etapa conectada
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
                              className="h-9 w-full rounded-lg border border-white/[0.09] bg-[#171A24] px-3 text-xs text-slate-100"
                            >
                              <option value="">Finalizar fluxo</option>
                              {nodes
                                .filter((n) => n.id !== selectedNode.id && n.kind !== "trigger")
                                .map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.title}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* MODO 2: SIMULADOR */}
                {drawerMode === "simulator" && (
                  <div className="space-y-4">
                    <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#0D0F16] p-3.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-400">Usuário de teste</label>
                          <Input
                            value={simUsername}
                            onChange={(e) => setSimUsername(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-400">Mensagem enviada</label>
                          <Input
                            value={simCommentText}
                            onChange={(e) => setSimCommentText(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#171A24] px-3 py-2">
                        <span className="text-xs text-slate-300">Relação com o perfil</span>
                        <button
                          type="button"
                          onClick={() => setSimIsFollowing((v) => !v)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                            simIsFollowing
                              ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                              : "border border-amber-500/40 bg-amber-500/15 text-amber-300"
                          }`}
                        >
                          {simIsFollowing ? "Segue a conta" : "Não segue"}
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={busySim}
                        onClick={() => handleRunSimulation("trigger")}
                        className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {busySim && <Spinner />}
                        Executar teste de gatilho
                      </button>
                    </div>

                    <div className="min-h-[22rem] max-h-[28rem] space-y-2.5 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#090A0F] p-3.5">
                      {simFeed.length === 0 ? (
                        <div className="flex h-56 flex-col items-center justify-center text-center text-xs text-slate-500">
                          <p className="font-medium text-slate-300">Nenhuma execução iniciada</p>
                          <p className="mt-1 max-w-xs">
                            Inicie o teste acima para inspecionar as respostas de comentário, validação de seguidor e entrega no Direct.
                          </p>
                        </div>
                      ) : (
                        simFeed.map((msg, i) => (
                          <div
                            key={i}
                            className={`rounded-lg p-3 text-xs ${
                              msg.sender === "user_comment"
                                ? "border border-white/[0.08] bg-[#141722] text-slate-200"
                                : msg.sender === "bot_comment"
                                  ? "ml-3 border border-sky-500/30 bg-sky-500/10 text-sky-100"
                                  : msg.sender === "user_dm"
                                    ? "ml-8 bg-indigo-600 text-white"
                                    : "mr-4 border border-white/[0.08] bg-[#171A24] text-slate-200"
                            }`}
                          >
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                              {msg.sender === "user_comment"
                                ? "Comentário recebido"
                                : msg.sender === "bot_comment"
                                  ? "Resposta pública"
                                  : msg.sender === "user_dm"
                                    ? `@${simUsername}`
                                    : "Direct enviado"}
                            </p>
                            <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                            {msg.quickReplyLabel && (
                              <button
                                type="button"
                                disabled={busySim}
                                onClick={() => handleRunSimulation("check_follow")}
                                className="mt-2.5 w-full rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25"
                              >
                                {msg.quickReplyLabel}
                              </button>
                            )}
                            {msg.buttonUrl && (
                              <a
                                href={msg.buttonUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2.5 block w-full rounded-md bg-indigo-600 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-indigo-500"
                              >
                                {msg.buttonTitle || "Abrir link"} ↗
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
                            className="h-8 text-xs"
                          />
                          <button
                            type="button"
                            disabled={busySim}
                            onClick={() => handleRunSimulation("submit_lead")}
                            className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white"
                          >
                            Enviar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* MODO 3: CRM E WEBHOOK */}
                {drawerMode === "crm" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/[0.08] bg-[#0D0F16] p-3 text-xs">
                      <p className="font-medium text-slate-200">Endpoint Webhook Meta</p>
                      <p className="mt-1 font-mono text-[11px] text-indigo-300 break-all">
                        {webhookUrl}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Token de verificação: <code className="font-mono text-slate-300">mercatta_mix_webhook_2026</code>
                      </p>
                    </div>

                    <div className="space-y-2">
                      {initialSessions.map((s) => (
                        <div
                          key={s.id}
                          className="rounded-xl border border-white/[0.07] bg-[#0D0F16] p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-medium text-slate-200">
                              @{s.igUsername || s.igSenderId}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                s.stage === "delivered"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-amber-500/15 text-amber-300"
                              }`}
                            >
                              {s.stage === "delivered" ? "Concluído" : "Aguardando"}
                            </span>
                          </div>
                          <p className="text-slate-400">
                            Interação: <span className="font-mono text-slate-300">{s.triggerText}</span>
                          </p>
                          {(s.leadWhatsapp || s.leadEmail) && (
                            <p className="font-mono text-emerald-400">
                              Contato: {s.leadWhatsapp || s.leadEmail}
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
                className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {busySave && <Spinner />}
                Salvar e publicar alterações
              </button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
