"use client";

import type { ComponentType, CSSProperties, FormEvent, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  CalendarDays,
  Check,
  ChevronDown,
  CirclePlus,
  Clock3,
  Eye,
  Link2,
  ListTodo,
  LoaderCircle,
  Mic,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Brand, ClientMark, SunMark } from "@/components/brand";
import { Feedback, TimeAgo } from "@/components/ui";
import {
  clientAccent,
  ObjectTypeIcon,
  objectTypeLabel,
} from "@/components/visual-grammar";
import {
  countUnreadNotifications,
  selectNotificationCenterItems,
  type NotificationCenterStatus,
} from "@/lib/notification-center";

const LazyAiDrawer = dynamic(
  () => import("@/components/ai-drawer").then((module) => module.AiDrawer),
  { ssr: false },
);

type NavIcon = ComponentType<{ size?: number }>;
type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: NavIcon;
};

const primaryNavItems: NavItem[] = [
  { href: "/day", label: "Mi día", shortLabel: "Día", icon: SunMark },
  { href: "/work", label: "Trabajo", shortLabel: "Trabajo", icon: ListTodo },
  { href: "/clients", label: "Clientes", shortLabel: "Clientes", icon: Users },
  {
    href: "/calendar",
    label: "Calendario",
    shortLabel: "Calendario",
    icon: CalendarDays,
  },
  {
    href: "/supervisor",
    label: "Supervisora",
    shortLabel: "Supervisora",
    icon: Sparkles,
  },
];

const utilityNavItems: NavItem[] = [
  {
    href: "/integrations",
    label: "Integraciones",
    shortLabel: "Integraciones",
    icon: Link2,
  },
];

const clientLabels: Record<string, string> = {
  gavilan: "Metauro",
  "luma-estudio": "Luma Estudio",
  luma: "Luma Estudio",
  "casa-norte": "Casa Norte",
  brava: "Brava Fit",
  "brava-fit": "Brava Fit",
  nido: "Nido",
};

const sidebarClients = [
  { slug: "gavilan", name: "Metauro" },
  { slug: "luma-estudio", name: "Luma" },
  { slug: "casa-norte", name: "Casa Norte" },
  { slug: "brava-fit", name: "Brava Fit" },
  { slug: "nido", name: "Nido" },
] as const;
type SidebarClient = {
  slug: string;
  name: string;
  accent?: string | null;
  logoUrl?: string | null;
};

const searchTargets = [
  ...primaryNavItems,
  ...utilityNavItems,
  {
    href: "/settings",
    label: "Configuración",
    shortLabel: "Configuración",
    icon: Settings,
  },
  {
    href: "/clients/gavilan",
    label: "Metauro",
    shortLabel: "Cliente",
    icon: Users,
  },
  {
    href: "/clients/luma-estudio",
    label: "Luma Estudio",
    shortLabel: "Cliente",
    icon: Users,
  },
  {
    href: "/clients/casa-norte",
    label: "Casa Norte",
    shortLabel: "Cliente",
    icon: Users,
  },
  {
    href: "/clients/brava-fit",
    label: "Brava Fit",
    shortLabel: "Cliente",
    icon: Users,
  },
  { href: "/clients/nido", label: "Nido", shortLabel: "Cliente", icon: Users },
];

type NotificationItem = {
  id: string;
  title: string;
  body?: string;
  message?: string;
  createdAt?: string;
  contextUrl?: string;
  targetPath?: string;
  deepLink?: string;
  url?: string;
  severity?: string;
  priority?: string;
  status?: NotificationCenterStatus;
  kind?: string;
  clientName?: string;
  clientSlug?: string;
  entityType?: string;
  entityId?: string;
  quickActions?: Array<
    string | { id?: string; action?: string; label?: string }
  >;
};

type NotificationAction =
  | "do_now"
  | "complete"
  | "resolve"
  | "snooze"
  | "dismiss"
  | "reduce_insistence";

function isRouteActive(pathname: string, href: string) {
  if (href === "/clients")
    return pathname === href || pathname.startsWith("/clients/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NotificationCenter({
  onClose,
  onCountChange,
}: {
  onClose: () => void;
  onCountChange: (count: number) => void;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  useEffect(() => {
    let ignore = false;
    void fetch("/api/nudges")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: unknown) => {
        if (ignore) return;
        const value = payload as
          | { nudges?: NotificationItem[] }
          | NotificationItem[];
        const rows = Array.isArray(value) ? value : value.nudges;
        const nextRows = selectNotificationCenterItems(rows ?? []);
        setNotifications(nextRows);
        setState("ready");
      })
      .catch(() => {
        if (!ignore) setState("error");
      });
    return () => {
      ignore = true;
    };
  }, [onCountChange]);

  const unreadCount = useMemo(
    () => countUnreadNotifications(notifications),
    [notifications],
  );
  const readItems = useMemo(
    () => notifications.filter((item) => item.status === "read"),
    [notifications],
  );

  useEffect(() => {
    onCountChange(unreadCount);
  }, [onCountChange, unreadCount]);

  function actionIds(item: NotificationItem) {
    return new Set(
      (item.quickActions ?? []).map((action) => {
        const value =
          typeof action === "string"
            ? action
            : action.id || action.action || "";
        if (value === "now") return "do_now";
        if (value === "done") return "complete";
        return value;
      }),
    );
  }

  function markBusy(id: string, busy: boolean) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function requestJson(url: string, init: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    if (!response.ok)
      throw new Error(payload?.message || "No pude actualizar ese aviso.");
    return payload;
  }

  async function markRead(item: NotificationItem) {
    if (busyIds.has(item.id) || item.status !== "delivered") return;
    const previous = notifications;
    setNotifications((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, status: "read" } : row,
      ),
    );
    markBusy(item.id, true);
    setFeedback(null);
    try {
      // Lifecycle contract: PATCH /api/nudges accepts { id, status: "read" }.
      await requestJson("/api/nudges", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, status: "read" }),
      });
      setFeedback({ message: "Aviso marcado como leído.", tone: "success" });
    } catch (error) {
      setNotifications(previous);
      setFeedback({
        message:
          error instanceof Error ? error.message : "No pude marcar ese aviso.",
        tone: "error",
      });
    } finally {
      markBusy(item.id, false);
    }
  }

  async function runAction(item: NotificationItem, action: NotificationAction) {
    if (busyIds.has(item.id)) return;
    const previous = notifications;
    setNotifications((current) => current.filter((row) => row.id !== item.id));
    markBusy(item.id, true);
    setFeedback(null);
    try {
      if (action === "complete" || action === "do_now") {
        await requestJson("/api/agent-actions", {
          method: "POST",
          body: JSON.stringify({ action, nudgeId: item.id }),
        });
      } else {
        const lifecycleAction =
          action === "reduce_insistence" ? "reduce_insistence" : action;
        await requestJson("/api/nudges", {
          method: "PATCH",
          body: JSON.stringify({
            id: item.id,
            action: lifecycleAction,
            ...(action === "snooze"
              ? {
                  snoozedUntil: new Date(
                    Date.now() + 2 * 60 * 60 * 1000,
                  ).toISOString(),
                }
              : {}),
          }),
        });
      }
      const message =
        action === "complete"
          ? "Marcado como resuelto."
          : action === "do_now"
            ? "Dale, abrí el trabajo y saqué este aviso de la cola."
            : action === "resolve"
              ? "Aviso marcado como resuelto."
              : action === "snooze"
                ? "Lo vuelvo a mostrar en dos horas."
                : action === "reduce_insistence"
                  ? "Voy a insistir menos con avisos como este."
                  : action === "dismiss"
                    ? "Aviso descartado."
                    : "Aviso abierto.";
      setFeedback({ message, tone: "success" });
      if (action === "do_now") {
        router.push(
          item.contextUrl ||
            item.targetPath ||
            item.deepLink ||
            item.url ||
            "/day",
        );
        onClose();
      }
    } catch (error) {
      setNotifications(previous);
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "No pude actualizar ese aviso.",
        tone: "error",
      });
    } finally {
      markBusy(item.id, false);
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((item) => item.status === "delivered");
    if (!unread.length || batchBusy) return;
    const previous = notifications;
    setBatchBusy(true);
    setFeedback(null);
    setNotifications((current) =>
      current.map((item) =>
        unread.some((candidate) => candidate.id === item.id)
          ? { ...item, status: "read" }
          : item,
      ),
    );
    try {
      await Promise.all(
        unread.map((item) =>
          requestJson("/api/nudges", {
            method: "PATCH",
            body: JSON.stringify({ id: item.id, status: "read" }),
          }),
        ),
      );
      setFeedback({
        message:
          unread.length === 1
            ? "Aviso marcado como leído."
            : "Avisos marcados como leídos.",
        tone: "success",
      });
    } catch (error) {
      setNotifications(previous);
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "No pude marcar todos los avisos.",
        tone: "error",
      });
    } finally {
      setBatchBusy(false);
    }
  }

  async function clearRead() {
    if (!readItems.length || batchBusy) return;
    const previous = notifications;
    setBatchBusy(true);
    setFeedback(null);
    setNotifications((current) =>
      current.filter(
        (item) => !readItems.some((candidate) => candidate.id === item.id),
      ),
    );
    try {
      await Promise.all(
        readItems.map((item) =>
          requestJson("/api/nudges", {
            method: "PATCH",
            body: JSON.stringify({ action: "dismiss", id: item.id }),
          }),
        ),
      );
      setFeedback({
        message:
          readItems.length === 1
            ? "Aviso limpiado."
            : "Avisos leídos limpiados.",
        tone: "success",
      });
    } catch (error) {
      setNotifications(previous);
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "No pude limpiar los avisos.",
        tone: "error",
      });
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <aside
      className="notification-panel is-open"
      data-testid="notification-panel"
      aria-label="Notificaciones"
      aria-busy={batchBusy}
    >
      <header>
        <div className="notification-panel__title">
          <Bell size={18} />
          <span>
            <strong>Notificaciones</strong>
            <small>{unreadCount} sin leer</small>
          </span>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Cerrar notificaciones"
        >
          <X size={19} />
        </button>
      </header>
      {state === "ready" && notifications.length > 0 ? (
        <div className="notification-panel__batch">
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0 || batchBusy}
          >
            <Eye size={14} /> Marcar leídas
          </button>
          <button
            type="button"
            onClick={() => void clearRead()}
            disabled={readItems.length === 0 || batchBusy}
          >
            <BellOff size={14} /> Limpiar leídas
          </button>
        </div>
      ) : null}
      {feedback ? (
        <p
          className={
            "notification-panel__feedback notification-panel__feedback--" +
            feedback.tone
          }
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
      <div className="notification-panel__list">
        {state === "loading" ? (
          <p className="notification-panel__state">
            <LoaderCircle className="spin" size={17} /> Buscando lo que necesita
            atención…
          </p>
        ) : null}
        {state === "error" ? (
          <p className="notification-panel__state">
            No pude actualizar los avisos. Probá de nuevo en un rato.
          </p>
        ) : null}
        {state === "ready" && notifications.length === 0 ? (
          <p className="notification-panel__state">No hay avisos pendientes.</p>
        ) : null}
        {notifications.map((item) => {
          const urgent = [item.severity, item.priority].some(
            (value) => value === "urgent" || value === "high",
          );
          const read = item.status === "read";
          const busy = busyIds.has(item.id);
          const allowedActions = actionIds(item);
          const accent = clientAccent(item.clientSlug, item.clientName);
          const entityLabel = objectTypeLabel(item.entityType || item.kind);
          return (
            <article
              className={
                "notification-item" +
                (urgent ? " notification-item--urgent" : "") +
                (read ? " is-read" : "") +
                (busy ? " is-busy" : "")
              }
              key={item.id}
              style={
                {
                  "--notification-client-accent": accent,
                } as CSSProperties
              }
            >
              <div className="notification-item__meta">
                <time>
                  <TimeAgo value={item.createdAt || "Ahora"} />
                </time>
                <span>{read ? "Leído" : "Nuevo"}</span>
              </div>
              {(item.clientName || item.entityType || item.kind) ? (
                <div className="notification-item__context">
                  {item.clientName ? (
                    <span
                      className="notification-item__client"
                      aria-label={`Cliente ${item.clientName}`}
                    >
                      {item.clientName.slice(0, 1).toLocaleUpperCase("es")}
                    </span>
                  ) : null}
                  <ObjectTypeIcon type={item.entityType || item.kind} size={13} />
                  <span>
                    {[item.clientName, entityLabel].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ) : null}
              <strong>{item.title}</strong>
              <p>{item.body || item.message}</p>
              <div className="notification-item__actions">
                <Link
                  href={
                    item.contextUrl ||
                    item.targetPath ||
                    item.deepLink ||
                    item.url ||
                    "/day"
                  }
                  prefetch={false}
                  onNavigate={onClose}
                >
                  Abrir
                </Link>
                {!read ? (
                  <button
                    type="button"
                    onClick={() => void markRead(item)}
                    disabled={busy}
                  >
                    <Eye size={13} /> Leído
                  </button>
                ) : null}
                {allowedActions.has("do_now") ? (
                  <button
                    type="button"
                    onClick={() => void runAction(item, "do_now")}
                    disabled={busy}
                  >
                    <Sparkles size={13} /> Lo hago ahora
                  </button>
                ) : null}
                {allowedActions.has("complete") ? (
                  <button
                    type="button"
                    onClick={() => void runAction(item, "complete")}
                    disabled={busy}
                  >
                    <Check size={13} /> Ya está
                  </button>
                ) : null}
                {!allowedActions.has("complete") ? (
                  <button
                    type="button"
                    onClick={() => void runAction(item, "resolve")}
                    disabled={busy}
                  >
                    <Check size={13} /> Resolver
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void runAction(item, "snooze")}
                  disabled={busy}
                >
                  <Clock3 size={13} /> Posponer 2 h
                </button>
                <button
                  type="button"
                  onClick={() => void runAction(item, "dismiss")}
                  disabled={busy}
                >
                  Descartar
                </button>
              </div>
              <button
                className="notification-item__quiet"
                type="button"
                onClick={() => void runAction(item, "reduce_insistence")}
                disabled={busy}
              >
                No me jodas con avisos como este
              </button>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

export function AppShell({
  children,
  aiMode,
}: {
  children: ReactNode;
  aiMode: "demo" | "real";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isRouterPending, startNavigationTransition] = useTransition();
  const [pendingNavigation, setPendingNavigation] = useState<{
    href: string;
    from: string;
  } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMounted, setAiMounted] = useState(false);
  const [activeNudgeId, setActiveNudgeId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [sidebarClientRows, setSidebarClientRows] = useState<SidebarClient[]>([...sidebarClients]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [intentPrefetchHref, setIntentPrefetchHref] = useState<string | null>(
    null,
  );
  const [globalFeedback, setGlobalFeedback] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const routePending = isRouterPending || pendingNavigation?.from === pathname;

  const currentClient = useMemo(() => {
    const match = pathname.match(/^\/clients\/([^/]+)/);
    if (!match) return { slug: null, name: null };
    const slug = decodeURIComponent(match[1]);
    return {
      slug,
      name:
        clientLabels[slug] ??
        slug
          .replace(/-/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    };
  }, [pathname]);

  const currentViewLabel = useMemo(() => {
    if (currentClient.name) {
      const segments = pathname.split("/").filter(Boolean);
      const section = segments[2];
      const entityId = segments[3];
      const sectionLabel: Record<string, string> = {
        resumen: "Resumen",
        estrategia: "Estrategia",
        ideas: "Idea",
        guiones: "Guion",
        contenido: "Contenido",
        calendario: "Calendario",
        metricas: "Métricas",
        pauta: "Pauta",
        notas: "Reuniones y notas",
      };
      return [currentClient.name, section ? sectionLabel[section] || section : null, entityId ? "objeto abierto" : null].filter(Boolean).join(" · ");
    }
    if (pathname.startsWith("/day")) return "Mi día";
    if (pathname.startsWith("/work")) return "Trabajo";
    if (pathname.startsWith("/calendar")) return "Calendario";
    if (pathname.startsWith("/clients")) return "Clientes";
    if (pathname.startsWith("/settings")) return "Configuración";
    return "General";
  }, [currentClient.name, pathname]);

  const filteredSearchTargets = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("es");
    if (!normalized) return searchTargets;
    return searchTargets.filter((item) =>
      `${item.label} ${item.shortLabel}`
        .toLocaleLowerCase("es")
        .includes(normalized),
    );
  }, [searchQuery]);

  const markNavigationIntent = useCallback((href: string) => {
    setIntentPrefetchHref(href);
  }, []);

  const beginLinkNavigation = useCallback(
    (href: string) => {
      setSearchOpen(false);
      if (href === pathname) return;
      const marker = { href, from: pathname };
      setPendingNavigation(marker);
      window.setTimeout(
        () =>
          setPendingNavigation((current) =>
            current === marker ? null : current,
          ),
        4000,
      );
    },
    [pathname],
  );

  const navigate = useCallback(
    (href: string) => {
      setSearchOpen(false);
      if (href === pathname) return;
      const marker = { href, from: pathname };
      setPendingNavigation(marker);
      window.setTimeout(
        () =>
          setPendingNavigation((current) =>
            current === marker ? null : current,
          ),
        4000,
      );
      startNavigationTransition(() => router.push(href));
    },
    [pathname, router],
  );

  const openAi = useCallback(() => {
    setAiMounted(true);
    setAiOpen(true);
  }, []);

  const warmAi = useCallback(() => {
    void import("@/components/ai-drawer");
  }, []);

  useEffect(() => {
    window.addEventListener("martu:open-ai", openAi);
    return () => window.removeEventListener("martu:open-ai", openAi);
  }, [openAi]);

  useEffect(() => {
    function handleGlobalKeys(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "k"
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
    }
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/nudges?limit=30")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: unknown) => {
        if (!active) return;
        const value = payload as
          | { nudges?: NotificationItem[]; unread?: number }
          | NotificationItem[];
        const rows = Array.isArray(value) ? value : value.nudges;
        const visibleRows = selectNotificationCenterItems(rows ?? []);
        setNotificationCount(countUnreadNotifications(visibleRows));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/clients")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { clients?: Array<{ slug: string; name: string; accent?: string | null; logoUrl?: string | null }> }) => {
        if (!active || !payload.clients) return;
        const known = new Map(payload.clients.map((client) => [client.slug, client]));
        setSidebarClientRows(sidebarClients.map((fallback) => ({ ...fallback, ...known.get(fallback.slug) })));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const updateIdentity = (event: Event) => {
      const detail = (event as CustomEvent<{ slug: string; name?: string; accent?: string | null; logoUrl?: string | null }>).detail;
      if (!detail?.slug) return;
      setSidebarClientRows((current) => current.map((client) => client.slug === detail.slug ? { ...client, ...detail } : client));
    };
    window.addEventListener("martu:client-identity", updateIdentity);
    return () => window.removeEventListener("martu:client-identity", updateIdentity);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const assistantAction = params.get("assistantAction");
      const nudgeId = params.get("nudgeId");
      if (params.get("assistant") === "open" || assistantAction) openAi();
      if (assistantAction === "reschedule" && nudgeId)
        setActiveNudgeId(nudgeId);
      if (assistantAction || nudgeId) {
        params.delete("assistantAction");
        params.delete("nudgeId");
        const next = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
        window.history.replaceState(window.history.state, "", next);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openAi]);

  useEffect(() => {
    function showFeedback(event: Event) {
      const detail = (
        event as CustomEvent<{ message: string; tone?: "success" | "error" }>
      ).detail;
      if (!detail?.message) return;
      setGlobalFeedback({
        message: detail.message,
        tone: detail.tone || "success",
      });
      window.setTimeout(() => setGlobalFeedback(null), 4200);
    }
    window.addEventListener("martu:feedback", showFeedback);
    return () => window.removeEventListener("martu:feedback", showFeedback);
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = filteredSearchTargets[0];
    if (target) navigate(target.href);
  }

  return (
    <div className={`app-shell${aiOpen ? " app-shell--ai-open" : ""}`}>
      <aside className="sidebar" aria-label="Navegación de Martu OS">
        <div className="sidebar__top">
          <Link
            className="brand-link"
            href="/day"
            prefetch={intentPrefetchHref === "/day" ? null : false}
            onMouseEnter={() => markNavigationIntent("/day")}
            onFocus={() => markNavigationIntent("/day")}
            onNavigate={() => beginLinkNavigation("/day")}
          >
            <Brand />
          </Link>
        </div>

        <nav className="sidebar__nav" aria-label="Navegación principal">
          {primaryNavItems.filter(({ href }) => href !== "/clients" && href !== "/supervisor").map(({ href, label, icon: Icon }) => {
            const active = isRouteActive(pathname, href);
            return (
              <Link
                className={active ? "nav-item is-active" : "nav-item"}
                href={href}
                key={href}
                aria-current={active ? "page" : undefined}
                prefetch={intentPrefetchHref === href ? null : false}
                onMouseEnter={() => markNavigationIntent(href)}
                onFocus={() => markNavigationIntent(href)}
                onNavigate={() => beginLinkNavigation(href)}
                onPointerEnter={href === "/supervisor" ? warmAi : undefined}
              >
                <Icon size={20} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar__client-heading">
          <span>Clientes</span>
          <Link href="/clients" aria-label="Ver clientes" prefetch={false}>+</Link>
        </div>
        <nav className="sidebar__clients" aria-label="Clientes">
          {sidebarClientRows.map((client) => {
            const href = `/clients/${client.slug}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                className={active ? "sidebar-client is-active" : "sidebar-client"}
                href={href}
                key={client.slug}
                aria-current={active ? "page" : undefined}
                prefetch={false}
                onNavigate={() => beginLinkNavigation(href)}
                style={{ "--client-accent": client.accent || clientAccent(client.slug, client.name) } as CSSProperties}
              >
                <ClientMark name={client.name} accent={client.accent || clientAccent(client.slug, client.name)} logoUrl={client.logoUrl} />
                <span>{client.name}</span>
              </Link>
            );
          })}
        </nav>

        <nav className="sidebar__utility" aria-label="Utilidades">
          {utilityNavItems.map(({ href, label, icon: Icon }) => {
            const active = isRouteActive(pathname, href);
            return (
              <Link
                className={active ? "nav-item is-active" : "nav-item"}
                href={href}
                key={href}
                aria-current={active ? "page" : undefined}
                prefetch={false}
                onNavigate={() => beginLinkNavigation(href)}
              >
                <Icon size={20} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <Link
            className={
              pathname === "/settings" ? "profile-row is-active" : "profile-row"
            }
            href="/settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            prefetch={false}
            onNavigate={() => beginLinkNavigation("/settings")}
          >
            <span className="avatar">
              M<span aria-hidden="true" />
            </span>
            <strong>Martu</strong>
            <ChevronDown size={16} />
          </Link>
          <div className="demo-mode">
            <span className="demo-mode__dot" />
            <span>{aiMode === "real" ? "Supervisora disponible" : "Modo local"}</span>
          </div>
        </div>
      </aside>

      <div className="workspace-frame">
        <header className="workspace-topbar">
          <Link
            className="mobile-brand-link"
            href="/day"
            prefetch={false}
            onNavigate={() => beginLinkNavigation("/day")}
          >
            <Brand compact />
          </Link>
          <button
            className="global-search-trigger"
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar en Martu OS"
          >
            <Search size={17} />
            <span>Buscar en Martu OS</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="workspace-topbar__actions">
            <Link
              className="icon-button topbar-create"
              href="/work"
              aria-label="Abrir trabajo"
              onNavigate={() => beginLinkNavigation("/work")}
              prefetch={intentPrefetchHref === "/work" ? null : false}
              onMouseEnter={() => markNavigationIntent("/work")}
              onFocus={() => markNavigationIntent("/work")}
            >
              <CirclePlus size={20} />
            </Link>
            <button
              className="icon-button notification-trigger"
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label={`Abrir notificaciones${notificationCount ? `, ${notificationCount} pendientes` : ""}`}
              data-testid="notification-center"
            >
              <Bell size={19} />
              {notificationCount > 0 ? <span>{notificationCount}</span> : null}
            </button>
            <Link
              className="topbar-avatar"
              href="/settings"
              aria-label="Abrir configuración de Martu"
              prefetch={false}
              onNavigate={() => beginLinkNavigation("/settings")}
            >
              M
            </Link>
          </div>
        </header>

        <div
          className={
            routePending ? "route-progress is-active" : "route-progress"
          }
          aria-live="polite"
          aria-atomic="true"
        >
          <span aria-hidden="true" />
          <span className="sr-only">
            {routePending ? "Cargando la vista" : "Vista lista"}
          </span>
        </div>
        <main className="workspace">{children}</main>
        {!aiOpen && pathname !== "/supervisor" ? (
          <button
            className="supervisor-dock"
            type="button"
            onClick={openAi}
            onPointerEnter={warmAi}
            onFocus={warmAi}
            aria-label={`Preguntale a la Supervisora. Contexto actual: ${currentViewLabel}`}
          >
            <Sparkles size={19} />
            <span>Preguntale a la Supervisora…</span>
            <small>{currentViewLabel}</small>
            <Mic size={18} />
          </button>
        ) : null}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Navegación principal">
        {primaryNavItems.map(({ href, shortLabel, icon: Icon }) => {
          const active = isRouteActive(pathname, href);
          return (
            <Link
              className={
                active ? "mobile-nav-item is-active" : "mobile-nav-item"
              }
              href={href}
              key={href}
              aria-current={active ? "page" : undefined}
              prefetch={intentPrefetchHref === href ? null : false}
              onPointerEnter={() => {
                markNavigationIntent(href);
                if (href === "/supervisor") warmAi();
              }}
              onFocus={() => markNavigationIntent(href)}
              onTouchStart={() => {
                markNavigationIntent(href);
                if (href === "/supervisor") warmAi();
              }}
              onNavigate={() => beginLinkNavigation(href)}
            >
              <Icon size={20} />
              <span>{shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      {aiMounted ? (
        <LazyAiDrawer
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          clientSlug={currentClient.slug}
          clientName={currentClient.name}
          initialAiMode={aiMode}
          initialNudgeId={activeNudgeId}
          onNudgeHandled={() => setActiveNudgeId(null)}
        />
      ) : null}
      {notificationsOpen ? (
        <NotificationCenter
          onClose={() => setNotificationsOpen(false)}
          onCountChange={setNotificationCount}
        />
      ) : null}
      {globalFeedback ? (
        <div className="global-feedback">
          <Feedback
            message={globalFeedback.message}
            tone={globalFeedback.tone}
          />
        </div>
      ) : null}
      {notificationsOpen ? (
        <button
          className="scrim"
          type="button"
          onClick={() => setNotificationsOpen(false)}
          aria-label="Cerrar notificaciones"
        />
      ) : null}

      {searchOpen ? (
        <div className="command-layer">
          <button
            className="command-layer__scrim"
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Cerrar búsqueda"
          />
          <section
            className="command-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-title"
          >
            <h2 id="command-title" className="sr-only">
              Buscar en Martu OS
            </h2>
            <form className="command-search" onSubmit={submitSearch}>
              <Search size={20} />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar una vista o cliente"
                aria-label="Buscar una vista o cliente"
              />
              <button
                className="icon-button"
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Cerrar búsqueda"
              >
                <X size={18} />
              </button>
            </form>
            <div className="command-results">
              {filteredSearchTargets.map(
                ({ href, label, shortLabel, icon: Icon }) => (
                  <Link
                    href={href}
                    key={href}
                    prefetch={intentPrefetchHref === href ? null : false}
                    onMouseEnter={() => markNavigationIntent(href)}
                    onFocus={() => markNavigationIntent(href)}
                    onNavigate={() => beginLinkNavigation(href)}
                  >
                    <Icon size={18} />
                    <span>
                      <strong>{label}</strong>
                      <small>{shortLabel}</small>
                    </span>
                  </Link>
                ),
              )}
              {filteredSearchTargets.length === 0 ? (
                <p>No encontré una vista con ese nombre.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
