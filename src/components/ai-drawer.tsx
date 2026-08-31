"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Mic,
  Plus,
  Send,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";

import { SunMark } from "@/components/brand";
import { Feedback } from "@/components/ui";
import { entityHref } from "@/lib/entity-href";

type EntityReceipt = {
  type?: string;
  summary: string;
  undoToken?: string;
  entity?: {
    id?: string;
    type?: string;
    title?: string;
    clientSlug?: string | null;
  };
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  createdAt?: string;
  receipt?: EntityReceipt;
};

type ThreadSummary = {
  id: string;
  title: string;
  clientSlug?: string | null;
  clientName?: string | null;
  lastMessageAt?: string | null;
};

type ContextEntityType =
  | "task"
  | "script"
  | "content"
  | "commitment"
  | "note"
  | "idea"
  | "open_loop"
  | "meeting";

type ConversationContext = {
  clientSlug: string | null;
  clientName: string | null;
  section?: string | null;
  entityType?: ContextEntityType | null;
  entityId?: string | null;
  entityTitle?: string | null;
};

type AiDrawerProps = {
  open: boolean;
  onClose: () => void;
  clientSlug?: string | null;
  clientName?: string | null;
  initialAiMode: "demo" | "real";
  initialNudgeId?: string | null;
  onNudgeHandled?: () => void;
};

type ApiError = Error & { status?: number };

const GLOBAL_CONTEXT: ConversationContext = { clientSlug: null, clientName: null };
const AI_RESPONSE_TIMEOUT_MS = 30_000;
const NEW_CONVERSATION_KEY = "martu-supervisor-new";
const CURRENT_CONTEXT_KEY = "martu-current-context";
const CONTEXT_ENTITY_TYPES = new Set<ContextEntityType>([
  "task",
  "script",
  "content",
  "commitment",
  "note",
  "idea",
  "open_loop",
  "meeting",
]);

function contextEntityType(value: unknown): ContextEntityType | null {
  return typeof value === "string" && CONTEXT_ENTITY_TYPES.has(value as ContextEntityType)
    ? value as ContextEntityType
    : null;
}

function entityTypeFromSection(section?: string | null): ContextEntityType | null {
  if (section === "guiones") return "script";
  if (section === "contenido") return "content";
  if (section === "ideas") return "idea";
  if (section === "notas") return "note";
  return contextEntityType(section);
}

function sectionFromEntityType(type?: ContextEntityType | null) {
  if (type === "script") return "guiones";
  if (type === "content") return "contenido";
  if (type === "idea") return "ideas";
  if (type === "note") return "notas";
  return type ?? null;
}

function entityTypeLabel(type?: ContextEntityType | null) {
  const labels: Record<ContextEntityType, string> = {
    task: "Tarea",
    script: "Guion",
    content: "Contenido",
    commitment: "Compromiso",
    note: "Nota",
    idea: "Idea",
    open_loop: "Hilo",
    meeting: "Reunión",
  };
  return type ? labels[type] : null;
}

function contextEntityTitle(context: ConversationContext) {
  if (context.entityTitle?.trim()) return context.entityTitle.trim();
  const labels: Record<ContextEntityType, string> = {
    task: "Tarea abierta",
    script: "Guion abierto",
    content: "Contenido abierto",
    commitment: "Compromiso abierto",
    note: "Nota abierta",
    idea: "Idea abierta",
    open_loop: "Hilo abierto",
    meeting: "Reunión abierta",
  };
  return context.entityType ? labels[context.entityType] : "Elemento abierto";
}

function contextEntityPayload(context: ConversationContext) {
  if (!context.entityId || !context.entityType) return undefined;
  return {
    id: context.entityId,
    type: context.entityType,
    title: contextEntityTitle(context),
    clientSlug: context.clientSlug,
  };
}

function currentViewPayload(context: ConversationContext) {
  const hasEntity = Boolean(context.entityId && context.entityType);
  return {
    pathname: typeof window === "undefined" ? "/" : window.location.pathname,
    section: context.section ?? null,
    clientSlug: context.clientSlug,
    clientName: context.clientName,
    entityType: context.entityType ?? null,
    entityId: context.entityId ?? null,
    entityTitle: hasEntity ? contextEntityTitle(context) : context.entityTitle ?? null,
  };
}

function contextLabel(context: ConversationContext) {
  const client = context.clientName || (context.clientSlug ? context.clientSlug : "Todo Martu OS");
  if (!context.entityId || !context.entityType) return client;
  return `${client} · ${entityTypeLabel(context.entityType)} “${contextEntityTitle(context)}”`;
}

function decodePathSegment(value?: string) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function contextFromLocation(fallback: ConversationContext): ConversationContext {
  if (typeof window === "undefined") return fallback;
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments[0] !== "clients") return fallback;
  const pathnameClient = decodePathSegment(segments[1]);
  if (!pathnameClient || (fallback.clientSlug && pathnameClient !== fallback.clientSlug)) return fallback;
  const section = decodePathSegment(segments[2]) ?? "resumen";
  const locationContext: ConversationContext = {
    ...fallback,
    clientSlug: fallback.clientSlug ?? pathnameClient,
    section,
    entityType: entityTypeFromSection(section),
    entityId: decodePathSegment(segments[3]),
  };
  try {
    const stored = record(JSON.parse(window.sessionStorage.getItem(CURRENT_CONTEXT_KEY) || "null"));
    const storedEntityType = contextEntityType(stored?.entityType);
    const storedEntityId = typeof stored?.entityId === "string" ? stored.entityId : null;
    const storedSection = typeof stored?.section === "string" ? stored.section : null;
    if (
      stored?.clientSlug === pathnameClient
      && storedSection === section
      && storedEntityType === locationContext.entityType
      && storedEntityId
      && (!locationContext.entityId || locationContext.entityId === storedEntityId)
    ) {
      return {
        ...locationContext,
        clientName: typeof stored.clientName === "string" ? stored.clientName : locationContext.clientName,
        entityId: storedEntityId,
        entityTitle: typeof stored.entityTitle === "string" ? stored.entityTitle : null,
      };
    }
  } catch {
    // A valid pathname still provides a safe fallback when storage is unavailable.
  }
  return locationContext;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function welcomeMessage(context: ConversationContext): ChatMessage {
  const contextCopy = context.clientName
    ? `Estoy trabajando en ${context.clientName}.`
    : "Estoy mirando tu operación completa.";
  return {
    id: `welcome-${context.clientSlug ?? "global"}`,
    role: "assistant",
    text: `${contextCopy} ¿Qué querés ordenar, decidir o dejar resuelto?`,
  };
}

function extractReply(payload: unknown) {
  const value = record(payload);
  if (!value) return "No recibí una respuesta válida. Probá de nuevo en un momento.";
  for (const key of ["message", "text", "output", "reply"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key] as string;
  }
  const nestedReply = record(value.reply);
  if (typeof nestedReply?.message === "string" && nestedReply.message.trim()) return nestedReply.message;
  return "No recibí una respuesta válida. Probá de nuevo en un momento.";
}

function receiptFromPayload(payload: unknown): EntityReceipt | undefined {
  const value = record(payload);
  if (!value) return undefined;
  const rawAction = record(value.action) ?? (Array.isArray(value.actions) ? record(value.actions[0]) : null);
  if (!rawAction) return undefined;
  const rawEntity = record(rawAction.entity);
  const fallbackSummary = typeof value.message === "string" ? value.message : "Cambio guardado.";
  return {
    type: typeof rawAction.type === "string" ? rawAction.type : undefined,
    summary: typeof rawAction.summary === "string" ? rawAction.summary : fallbackSummary,
    undoToken: typeof rawAction.undoToken === "string"
      ? rawAction.undoToken
      : typeof value.undoToken === "string" ? value.undoToken : undefined,
    entity: rawEntity ? {
      id: typeof rawEntity.id === "string" ? rawEntity.id : rawEntity.id != null ? String(rawEntity.id) : undefined,
      type: typeof rawEntity.type === "string" ? rawEntity.type : undefined,
      title: typeof rawEntity.title === "string" ? rawEntity.title : undefined,
      clientSlug: typeof rawEntity.clientSlug === "string" ? rawEntity.clientSlug : null,
    } : undefined,
  };
}

function messageFromRow(value: unknown): ChatMessage | null {
  const row = record(value);
  if (!row || (row.role !== "assistant" && row.role !== "user") || typeof row.content !== "string") return null;
  return {
    id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
    role: row.role,
    text: row.content,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
    receipt: receiptFromPayload(record(row.actionResult) ?? row),
  };
}

function contextFromThreadRows(
  values: unknown[],
  fallback: ConversationContext,
): ConversationContext {
  for (const value of values) {
    const row = record(value);
    if (!row || row.role !== "user") continue;
    const metadata = record(row.actionResult) ?? record(row.toolPayload);
    if (metadata?.conversationScope === "global") return GLOBAL_CONTEXT;
    const entity = record(metadata?.conversationContext);
    const entityType = contextEntityType(entity?.type);
    if (!entity || !entityType || entity.id == null || typeof entity.title !== "string") continue;
    const entityClientSlug = typeof entity.clientSlug === "string" ? entity.clientSlug : fallback.clientSlug;
    return {
      ...fallback,
      clientSlug: entityClientSlug,
      section: sectionFromEntityType(entityType),
      entityType,
      entityId: String(entity.id),
      entityTitle: entity.title,
    };
  }
  return fallback;
}

function relativeDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(date);
}

async function readPayload(response: Response) {
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(extractReply(payload)) as ApiError;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function AiDrawer({
  open,
  onClose,
  clientSlug,
  clientName,
  initialAiMode,
  initialNudgeId,
  onNudgeHandled,
}: AiDrawerProps) {
  const router = useRouter();
  const initialContext = useMemo<ConversationContext>(() => ({
    clientSlug: clientSlug ?? null,
    clientName: clientName ?? null,
  }), [clientName, clientSlug]);
  const [pageContext, setPageContext] = useState<ConversationContext>(() => contextFromLocation(initialContext));
  const [pinnedContext, setPinnedContext] = useState<ConversationContext>(() => contextFromLocation(initialContext));
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage(contextFromLocation(initialContext))]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [activeNudgeId, setActiveNudgeId] = useState<string | null>(initialNudgeId ?? null);
  const pageContextRef = useRef<ConversationContext>(contextFromLocation(initialContext));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const discardRecordingRef = useRef(false);
  const openRef = useRef(open);
  const chunksRef = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const bootstrappedRef = useRef(false);
  const historyRequestRef = useRef(0);
  const createNewThreadRef = useRef(false);
  const draftContextLockedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const hasConversation = messages.some((message) => message.role === "user") || Boolean(threadId);
  const hasConversationRef = useRef(hasConversation);

  useEffect(() => {
    hasConversationRef.current = hasConversation;
  }, [hasConversation]);

  useEffect(() => {
    const nextContext = contextFromLocation(initialContext);
    pageContextRef.current = nextContext;
    setPageContext(nextContext);
    if (!hasConversationRef.current && !draftContextLockedRef.current) {
      setPinnedContext(nextContext);
      setMessages([welcomeMessage(nextContext)]);
    }
  }, [initialContext]);

  useEffect(() => {
    function receiveContext(event: Event) {
      const detail = record((event as CustomEvent).detail);
      if (!detail) return;
      const entityType = contextEntityType(detail.entityType);
      const entityId = detail.entityId == null ? null : String(detail.entityId);
      const clientSlugValue = typeof detail.clientSlug === "string" ? detail.clientSlug : clientSlug ?? null;
      const previous = pageContextRef.current;
      const sameEntity = previous.clientSlug === clientSlugValue
        && previous.entityType === entityType
        && previous.entityId === entityId;
      const nextContext = {
        clientSlug: clientSlugValue,
        clientName: typeof detail.clientName === "string" ? detail.clientName : clientName ?? null,
        section: typeof detail.section === "string" ? detail.section : null,
        entityType,
        entityId,
        entityTitle: typeof detail.entityTitle === "string"
          ? detail.entityTitle
          : sameEntity ? previous.entityTitle ?? null : null,
      };
      pageContextRef.current = nextContext;
      setPageContext(nextContext);
      if (!hasConversationRef.current && !draftContextLockedRef.current) {
        setPinnedContext(nextContext);
        setMessages([welcomeMessage(nextContext)]);
      }
    }
    window.addEventListener("martu:context", receiveContext);
    return () => window.removeEventListener("martu:context", receiveContext);
  }, [clientName, clientSlug]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleEscape);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    openRef.current = open;
    if (open) return;
    discardRecordingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stopStream(streamRef.current);
    streamRef.current = null;
  }, [open]);

  useEffect(() => () => {
    discardRecordingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, open, sending]);

  useEffect(() => {
    if (initialNudgeId) setActiveNudgeId(initialNudgeId);
  }, [initialNudgeId]);

  useEffect(() => {
    if (!activeNudgeId || !open || input) return;
    setInput("Pasalo a mañana");
  }, [activeNudgeId, input, open]);

  useEffect(() => {
    if (!open || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const savedThreadId = window.localStorage.getItem("martu-supervisor-thread");
    const savedNudgeId = window.sessionStorage.getItem("martu-supervisor-nudge");
    const savedPrefill = window.sessionStorage.getItem("martu-supervisor-prefill");
    if (savedNudgeId) setActiveNudgeId(savedNudgeId);
    if (savedPrefill) {
      setInput(savedPrefill);
      window.sessionStorage.removeItem("martu-supervisor-prefill");
    }
    const startFresh = window.sessionStorage.getItem(NEW_CONVERSATION_KEY) === "true";
    if (startFresh || !savedThreadId) {
      window.sessionStorage.removeItem(NEW_CONVERSATION_KEY);
      startConversation(pageContext);
      void loadThreads();
    } else {
      void loadThreads(savedThreadId);
    }
  // loadThreads is intentionally an open-time bootstrap, not a reactive fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loadThreads(savedThreadId?: string | null) {
    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    try {
      const payload = record(await readPayload(await fetch("/api/ai/threads?limit=20", { cache: "no-store" })));
      const nextThreads = (Array.isArray(payload?.threads) ? payload.threads : [])
        .map((item): ThreadSummary | null => {
          const thread = record(item);
          if (!thread || thread.id == null) return null;
          return {
            id: String(thread.id),
            title: typeof thread.title === "string" && thread.title.trim() ? thread.title : "Conversación",
            clientSlug: typeof thread.clientSlug === "string" ? thread.clientSlug : null,
            clientName: typeof thread.clientName === "string" ? thread.clientName : null,
            lastMessageAt: typeof thread.lastMessageAt === "string" ? thread.lastMessageAt : null,
          };
        })
        .filter((item): item is ThreadSummary => Boolean(item));
      if (requestId !== historyRequestRef.current) return;
      setThreads(nextThreads);
      if (savedThreadId && nextThreads.some((thread) => thread.id === savedThreadId)) {
        await openThread(savedThreadId);
      } else if (savedThreadId) {
        window.localStorage.removeItem("martu-supervisor-thread");
        createNewThreadRef.current = true;
      }
    } catch {
      // The supervisor still works if history is temporarily unavailable.
    } finally {
      if (requestId === historyRequestRef.current) setHistoryLoading(false);
    }
  }

  async function openThread(id: string) {
    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    setFeedback(null);
    try {
      const payload = record(await readPayload(await fetch(`/api/ai/threads/${encodeURIComponent(id)}?limit=100`, { cache: "no-store" })));
      const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      const loadedMessages = rawMessages
        .map(messageFromRow)
        .filter((message): message is ChatMessage => Boolean(message));
      const thread = record(payload?.thread);
      const nextClientSlug = typeof thread?.clientSlug === "string" ? thread.clientSlug : null;
      const nextClientName = typeof thread?.clientName === "string" ? thread.clientName : nextClientSlug;
      const matchingPage = nextClientSlug && nextClientSlug === pageContext.clientSlug ? pageContext : null;
      const threadFallback = thread?.scope === "global"
        ? GLOBAL_CONTEXT
        : matchingPage ?? { clientSlug: nextClientSlug, clientName: nextClientName };
      const threadContext = contextFromThreadRows(rawMessages, threadFallback);
      if (requestId !== historyRequestRef.current) return;
      setPinnedContext(threadContext);
      setThreadId(id);
      createNewThreadRef.current = false;
      draftContextLockedRef.current = true;
      setMessages(loadedMessages.length ? loadedMessages : [welcomeMessage(threadContext)]);
      setHistoryOpen(false);
      setUndoToken(null);
      window.localStorage.setItem("martu-supervisor-thread", id);
    } catch (error) {
      if (requestId !== historyRequestRef.current) return;
      const apiError = error as ApiError;
      if (apiError.status === 404) window.localStorage.removeItem("martu-supervisor-thread");
      setFeedback(apiError.message || "No pude abrir esa conversación.");
    } finally {
      if (requestId === historyRequestRef.current) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    function receiveThread(event: Event) {
      const detail = record((event as CustomEvent).detail);
      if (detail?.threadId != null) void openThread(String(detail.threadId));
    }
    function receiveNudge(event: Event) {
      const detail = record((event as CustomEvent).detail);
      if (detail?.nudgeId != null) {
        const id = String(detail.nudgeId);
        setActiveNudgeId(id);
        window.sessionStorage.setItem("martu-supervisor-nudge", id);
        setInput("Pasalo a mañana");
      }
    }
    function receivePrefill(event: Event) {
      const detail = record((event as CustomEvent).detail);
      if (typeof detail?.message === "string") setInput(detail.message);
    }
    function receiveNewConversation() {
      window.sessionStorage.removeItem(NEW_CONVERSATION_KEY);
      startConversation(pageContext);
    }
    window.addEventListener("martu:supervisor-thread", receiveThread);
    window.addEventListener("martu:supervisor-nudge", receiveNudge);
    window.addEventListener("martu:supervisor-prefill", receivePrefill);
    window.addEventListener("martu:supervisor-new", receiveNewConversation);
    return () => {
      window.removeEventListener("martu:supervisor-thread", receiveThread);
      window.removeEventListener("martu:supervisor-nudge", receiveNudge);
      window.removeEventListener("martu:supervisor-prefill", receivePrefill);
      window.removeEventListener("martu:supervisor-new", receiveNewConversation);
    };
  // These listeners intentionally call the latest in-component thread loader.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageContext]);

  function startConversation(context: ConversationContext = pageContext, lockContext = false) {
    historyRequestRef.current += 1;
    setHistoryLoading(false);
    setThreadId(null);
    createNewThreadRef.current = true;
    draftContextLockedRef.current = lockContext;
    setPinnedContext(context);
    setMessages([welcomeMessage(context)]);
    setInput("");
    setUndoToken(null);
    setFeedback(null);
    setHistoryOpen(false);
    window.localStorage.removeItem("martu-supervisor-thread");
    window.sessionStorage.removeItem(NEW_CONVERSATION_KEY);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function sendMessage(forced?: string) {
    const text = (forced ?? input).trim();
    if (!text || sending) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    setFeedback(null);
    setInput("");
    setMessages((current) => [...current, userMessage]);
    setSending(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AI_RESPONSE_TIMEOUT_MS);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          clientSlug: pinnedContext.clientSlug,
          pathname: window.location.pathname,
          threadId: threadId ?? undefined,
          createNewThread: !threadId && createNewThreadRef.current,
          nudgeId: activeNudgeId ?? undefined,
          contextScope: pinnedContext.clientSlug ? "client" : "global",
          contextEntity: contextEntityPayload(pinnedContext),
          currentView: currentViewPayload(pageContext),
        }),
      });
      const payload = await readPayload(response);
      const value = record(payload);
      const nextThreadId = value?.threadId != null ? String(value.threadId) : threadId;
      const receipt = receiptFromPayload(payload);
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: extractReply(payload),
        receipt,
      }]);
      if (nextThreadId) {
        setThreadId(nextThreadId);
        createNewThreadRef.current = false;
        draftContextLockedRef.current = true;
        window.localStorage.setItem("martu-supervisor-thread", nextThreadId);
      }
      if (receipt?.undoToken) setUndoToken(receipt.undoToken);
      if (receipt) {
        setFeedback("Cambio guardado.");
        setActiveNudgeId(null);
        window.sessionStorage.removeItem("martu-supervisor-nudge");
        onNudgeHandled?.();
        router.refresh();
      }
      void loadThreads(nextThreadId);
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: aborted
          ? "No recibí la respuesta a tiempo. Antes de reintentar, revisá si el cambio apareció en la pantalla o en el historial."
          : error instanceof Error ? error.message : "No pude responder ahora.",
      }]);
    } finally {
      window.clearTimeout(timeout);
      setSending(false);
    }
  }

  async function undoLastAction() {
    if (!undoToken || sending) return;
    setSending(true);
    try {
      await readPayload(await fetch("/api/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undoToken, threadId: threadId ?? undefined }),
      }));
      setUndoToken(null);
      setFeedback("Cambio deshecho.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pude deshacer ese cambio.");
    } finally {
      setSending(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      discardRecordingRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      setRecording(false);
      return;
    }
    setFeedback(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setFeedback("Este navegador no permite grabar audio. Podés escribir el mensaje.");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!openRef.current) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      discardRecordingRef.current = false;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stopStream(stream);
        if (streamRef.current === stream) streamRef.current = null;
        if (recorderRef.current === recorder) recorderRef.current = null;
        setRecording(false);
        const discard = discardRecordingRef.current;
        discardRecordingRef.current = false;
        if (discard) {
          chunksRef.current = [];
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "martu-audio.webm");
        form.append("clientSlug", pinnedContext.clientSlug ?? "");
        form.append("pathname", window.location.pathname);
        form.append("process", "true");
        form.append("contextScope", pinnedContext.clientSlug ? "client" : "global");
        form.append("currentView", JSON.stringify(currentViewPayload(pageContext)));
        const pinnedEntity = contextEntityPayload(pinnedContext);
        if (pinnedEntity) form.append("contextEntity", JSON.stringify(pinnedEntity));
        if (threadId) form.append("threadId", threadId);
        else form.append("createNewThread", String(createNewThreadRef.current));
        if (activeNudgeId) form.append("nudgeId", activeNudgeId);
        setSending(true);
        try {
          const payload = await readPayload(await fetch("/api/ai/transcribe", { method: "POST", body: form }));
          const value = record(payload);
          const transcript = typeof value?.text === "string" ? value.text : "";
          if (!transcript) throw new Error("No pude entender el audio.");
          const nestedReply = record(value?.reply);
          const resolvedPayload = nestedReply ?? value;
          const receipt = receiptFromPayload(resolvedPayload);
          const nextThreadId = resolvedPayload?.threadId != null ? String(resolvedPayload.threadId) : threadId;
          setMessages((current) => [
            ...current,
            { id: crypto.randomUUID(), role: "user", text: transcript },
            { id: crypto.randomUUID(), role: "assistant", text: extractReply(resolvedPayload), receipt },
          ]);
          if (nextThreadId) {
            setThreadId(nextThreadId);
            createNewThreadRef.current = false;
            draftContextLockedRef.current = true;
            window.localStorage.setItem("martu-supervisor-thread", nextThreadId);
          }
          if (receipt?.undoToken) setUndoToken(receipt.undoToken);
          if (receipt) {
            setFeedback("Audio procesado y cambio guardado.");
            setActiveNudgeId(null);
            window.sessionStorage.removeItem("martu-supervisor-nudge");
            onNudgeHandled?.();
            router.refresh();
          } else {
            setFeedback("Audio procesado.");
          }
          void loadThreads(nextThreadId);
        } catch (error) {
          setFeedback(error instanceof Error ? error.message : "No pude procesar el audio.");
        } finally {
          setSending(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      stopStream(stream);
      if (streamRef.current === stream) streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setFeedback("Necesito permiso para usar el micrófono.");
    }
  }

  const contextChanged = hasConversation && (
    pageContext.clientSlug !== pinnedContext.clientSlug
    || pageContext.section !== pinnedContext.section
    || pageContext.entityType !== pinnedContext.entityType
    || pageContext.entityId !== pinnedContext.entityId
  );

  return (
    <aside
      className={open ? "ai-drawer is-open" : "ai-drawer"}
      aria-hidden={!open}
      aria-label="Supervisora"
      aria-modal="true"
      data-runtime={initialAiMode}
      data-testid="ai-drawer"
      inert={!open ? true : undefined}
      role="dialog"
    >
      <header className="ai-drawer__header">
        <div>
          <div className="ai-drawer__title"><Sparkles size={17} />Supervisora</div>
          <button
            className="ai-drawer__context"
            type="button"
            onClick={() => startConversation(pinnedContext.clientSlug ? GLOBAL_CONTEXT : pageContext, true)}
            title="Iniciar otra conversación con un contexto distinto"
          >
            Contexto: <strong>{contextLabel(pinnedContext)}</strong>
          </button>
        </div>
        <div className="ai-drawer__header-actions">
          <button className="icon-button" type="button" onClick={() => setHistoryOpen((value) => !value)} aria-label="Ver conversaciones" aria-pressed={historyOpen}><History size={18} /></button>
          <button className="icon-button" type="button" onClick={() => startConversation(pageContext)} aria-label="Nueva conversación"><Plus size={19} /></button>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar supervisora"><X size={21} /></button>
        </div>
      </header>

      {contextChanged ? (
        <div className="ai-context-notice" role="status">
          <span>Este hilo sigue en <strong>{contextLabel(pinnedContext)}</strong>. Vista actual: {contextLabel(pageContext)}.</span>
          <button type="button" onClick={() => startConversation(pageContext, true)}>Usar vista actual <ArrowRight size={14} /></button>
        </div>
      ) : null}

      {historyOpen ? (
        <section className="ai-history" aria-label="Conversaciones anteriores">
          <div className="ai-history__head">
            <strong>Conversaciones</strong>
            <button type="button" onClick={() => startConversation(pageContext)}><Plus size={15} />Nueva</button>
          </div>
          <p className="ai-history__empty">El historial guarda conversaciones. La memoria de trabajo se gestiona aparte.</p>
          {historyLoading ? <p className="ai-history__empty">Cargando…</p> : null}
          {!historyLoading && !threads.length ? <p className="ai-history__empty">Todavía no hay conversaciones guardadas.</p> : null}
          {threads.map((thread) => (
            <button className={thread.id === threadId ? "ai-history__item is-active" : "ai-history__item"} type="button" key={thread.id} onClick={() => void openThread(thread.id)} disabled={historyLoading}>
              <span>{thread.title}</span>
              <small><Clock3 size={12} />{relativeDate(thread.lastMessageAt)}</small>
            </button>
          ))}
        </section>
      ) : (
        <div className="ai-drawer__messages" aria-live="polite" aria-busy={sending}>
          {messages.map((message, index) => (
            <article className={`chat-message chat-message--${message.role}`} key={message.id}>
              <div className="chat-message__meta">
                {message.role === "assistant" ? <SunMark size={22} /> : <span className="mini-avatar">M</span>}
                <strong>{message.role === "assistant" ? "Supervisora" : "Martu"}</strong>
                <time>{message.createdAt ? relativeDate(message.createdAt) : index === 0 ? "inicio" : "ahora"}</time>
              </div>
              <p>{message.text}</p>
              {message.role === "assistant" && index === 0 && messages.length === 1 ? (
                <div className="quick-actions">
                  <button type="button" onClick={() => void sendMessage("¿Qué tengo pendiente hoy?")}>Pendientes de hoy</button>
                  <button type="button" onClick={() => void sendMessage("¿Qué se está trabando?")}>Qué está trabado</button>
                  <button type="button" onClick={() => void sendMessage("Ayudame a priorizar")}>Priorizar</button>
                </div>
              ) : null}
              {message.receipt ? (
                <div className="agent-receipt">
                  <div><CheckCircle2 size={16} /><span><strong>Cambio guardado</strong><small>{message.receipt.summary}</small></span></div>
                  {message.receipt.entity?.id ? (
                    <Link href={entityHref({
                      clientSlug: message.receipt.entity.clientSlug ?? pinnedContext.clientSlug,
                      entityType: message.receipt.entity.type,
                      entityId: message.receipt.entity.id,
                    })} onClick={onClose}>
                      Abrir {message.receipt.entity.title || "detalle"}<ChevronRight size={14} />
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
          {sending ? <div className="chat-typing"><span /><span /><span /> buscando lo justo</div> : null}
          <div ref={endRef} />
        </div>
      )}

      <footer className="ai-composer">
        <Feedback message={feedback} />
        {undoToken ? (
          <button className="undo-action" type="button" onClick={() => void undoLastAction()} disabled={sending}><CheckCircle2 size={15} />Cambio actualizado<Undo2 size={14} />Deshacer</button>
        ) : null}
        <div className="ai-composer__field">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Escribile a tu supervisora"
            rows={3}
            data-testid="ai-input"
          />
          <button className="send-button" type="button" onClick={() => void sendMessage()} aria-label="Enviar mensaje" data-testid="ai-send" disabled={sending || !input.trim()}><Send size={18} /></button>
        </div>
        <button
          className={recording ? "record-button is-recording" : "record-button"}
          type="button"
          onClick={() => void toggleRecording()}
          disabled={sending && !recording}
          aria-label={recording ? "Terminar grabación" : "Grabar audio"}
        ><Mic size={20} /></button>
        <small>{recording ? "Grabando; tocá para terminar" : "También podés hablar"}</small>
      </footer>
    </aside>
  );
}
