// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiDrawer } from "./ai-drawer";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

type FetchCall = { url: string; body?: Record<string, unknown> };

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function installFetch() {
  let chatCount = 0;
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/ai/threads")) return response({ threads: [] });
    if (url === "/api/ai/chat") {
      chatCount += 1;
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined,
      });
      return response({ message: `Respuesta ${chatCount}`, threadId: `thread-${chatCount}`, actions: [] });
    }
    throw new Error(`Fetch inesperado: ${url}`);
  }));
  return calls;
}

async function send(message: string) {
  fireEvent.change(screen.getByTestId("ai-input"), { target: { value: message } });
  fireEvent.click(screen.getByTestId("ai-send"));
  await screen.findByText(/Respuesta \d/);
}

describe("AiDrawer chat contract", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/clients/gavilan/guiones/73");
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends the exact open entity using the API context contract", async () => {
    const calls = installFetch();
    render(
      <AiDrawer
        open
        onClose={vi.fn()}
        clientSlug="gavilan"
        clientName="Gavilán"
        initialAiMode="demo"
      />,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent("martu:context", {
        detail: {
          clientSlug: "gavilan",
          clientName: "Gavilán",
          section: "guiones",
          entityType: "script",
          entityId: "73",
          entityTitle: "Guion de lanzamiento",
        },
      }));
      window.dispatchEvent(new CustomEvent("martu:context", {
        detail: {
          clientSlug: "gavilan",
          clientName: "Gavilán",
          section: "guiones",
          entityType: "script",
          entityId: "73",
        },
      }));
    });
    await send("Pasalo al viernes.");

    expect(calls[0]?.body).toMatchObject({
      message: "Pasalo al viernes.",
      clientSlug: "gavilan",
      pathname: "/clients/gavilan/guiones/73",
      contextScope: "client",
      contextEntity: {
        id: "73",
        type: "script",
        title: "Guion de lanzamiento",
        clientSlug: "gavilan",
      },
      currentView: {
        pathname: "/clients/gavilan/guiones/73",
        section: "guiones",
        clientSlug: "gavilan",
        clientName: "Gavilán",
        entityType: "script",
        entityId: "73",
        entityTitle: "Guion de lanzamiento",
      },
    });
    expect(calls[0]?.body).not.toHaveProperty("contextTarget");
  });

  it("hydrates the selected entity published before the lazy drawer mounts", async () => {
    window.history.replaceState({}, "", "/clients/gavilan/ideas");
    window.sessionStorage.setItem("martu-current-context", JSON.stringify({
      clientSlug: "gavilan",
      clientName: "Gavilán",
      section: "ideas",
      entityType: "idea",
      entityId: "52",
      entityTitle: "Microhistorias",
    }));
    const calls = installFetch();

    render(
      <AiDrawer
        open
        onClose={vi.fn()}
        clientSlug="gavilan"
        clientName="Gavilán"
        initialAiMode="demo"
      />,
    );
    await send("¿Cómo sigo con esto?");

    expect(calls[0]?.body).toMatchObject({
      contextEntity: {
        id: "52",
        type: "idea",
        title: "Microhistorias",
      },
      currentView: {
        pathname: "/clients/gavilan/ideas",
        entityType: "idea",
        entityId: "52",
        entityTitle: "Microhistorias",
      },
    });
  });

  it("starts fresh by default and keeps Nueva conversación as a distinct thread", async () => {
    const calls = installFetch();
    render(
      <AiDrawer
        open
        onClose={vi.fn()}
        clientSlug="gavilan"
        clientName="Gavilán"
        initialAiMode="demo"
      />,
    );

    await send("Primera conversación");
    fireEvent.click(screen.getByRole("button", { name: "Nueva conversación" }));
    await send("Segunda conversación");

    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toMatchObject({ createNewThread: true });
    expect(calls[1]?.body).toMatchObject({ createNewThread: true });
    expect(calls[1]?.body).not.toHaveProperty("threadId");
  });

  it("pins an explicit global conversation while still reporting the current view", async () => {
    const calls = installFetch();
    render(
      <AiDrawer
        open
        onClose={vi.fn()}
        clientSlug="gavilan"
        clientName="Gavilán"
        initialAiMode="demo"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Contexto:/ }));
    await waitFor(() => expect(screen.getByText("Todo Martu OS")).toBeTruthy());
    act(() => {
      window.dispatchEvent(new CustomEvent("martu:context", {
        detail: {
          clientSlug: "gavilan",
          clientName: "Gavilán",
          section: "guiones",
          entityType: "script",
          entityId: "73",
        },
      }));
    });
    await send("¿Qué tengo hoy?");

    expect(calls[0]?.body).toMatchObject({
      clientSlug: null,
      contextScope: "global",
      createNewThread: true,
    });
    expect(calls[0]?.body).toMatchObject({
      pathname: "/clients/gavilan/guiones/73",
      currentView: {
        pathname: "/clients/gavilan/guiones/73",
        clientSlug: "gavilan",
        entityType: "script",
        entityId: "73",
      },
    });
    expect(calls[0]?.body).not.toHaveProperty("contextEntity");
  });

  it("keeps the thread context pinned after navigation and offers a contextual fresh thread", async () => {
    const calls = installFetch();
    render(
      <AiDrawer
        open
        onClose={vi.fn()}
        clientSlug="gavilan"
        clientName="Gavilán"
        initialAiMode="demo"
      />,
    );

    act(() => {
      window.history.replaceState({}, "", "/clients/gavilan/ideas/52");
      window.dispatchEvent(new CustomEvent("martu:context", {
        detail: {
          clientSlug: "gavilan",
          clientName: "Gavilán",
          section: "ideas",
          entityType: "idea",
          entityId: "52",
          entityTitle: "Microhistorias",
        },
      }));
    });
    await send("Trabajemos esta idea");

    act(() => {
      window.history.replaceState({}, "", "/clients/luma-estudio/ideas/88");
      window.dispatchEvent(new CustomEvent("martu:context", {
        detail: {
          clientSlug: "luma-estudio",
          clientName: "Luma Estudio",
          section: "ideas",
          entityType: "idea",
          entityId: "88",
          entityTitle: "Antes y después",
        },
      }));
    });

    expect((await screen.findByRole("status")).textContent).toMatch(/Este hilo sigue en.*Microhistorias.*Vista actual:.*Antes y después/i);
    await send("¿Cómo sigo con esto?");

    expect(calls[1]?.body).toMatchObject({
      clientSlug: "gavilan",
      threadId: "thread-1",
      contextEntity: { id: "52", type: "idea", title: "Microhistorias", clientSlug: "gavilan" },
      currentView: {
        pathname: "/clients/luma-estudio/ideas/88",
        clientSlug: "luma-estudio",
        clientName: "Luma Estudio",
        entityType: "idea",
        entityId: "88",
        entityTitle: "Antes y después",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Usar vista actual/i }));
    await send("Sigamos desde acá");
    expect(calls[2]?.body).toMatchObject({
      clientSlug: "luma-estudio",
      createNewThread: true,
      contextEntity: { id: "88", type: "idea", title: "Antes y después", clientSlug: "luma-estudio" },
    });
    expect(calls[2]?.body).not.toHaveProperty("threadId");
  });
});
