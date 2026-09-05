// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientWorkspaceData } from "./types";
import {
  ContentWorkspace,
  IdeasWorkspace,
  ScriptsWorkspace,
} from "./client-v1-panels";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", async () => {
  const react = await vi.importActual<typeof import("react")>("react");
  return {
    useRouter: () => ({ push, replace }),
    usePathname: () =>
      react.useSyncExternalStore(
        (onStoreChange) => {
          window.addEventListener("popstate", onStoreChange);
          return () => window.removeEventListener("popstate", onStoreChange);
        },
        () => window.location.pathname,
        () => "/",
      ),
  };
});

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const data = {
  client: {
    id: "1",
    slug: "gavilan",
    name: "Gavilán",
    description: "",
    status: "Activo",
    services: [],
  },
  services: [],
  tabs: ["Ideas"],
  ideas: [
    {
      id: "52",
      title: "Idea original",
      description: "",
      status: "Borrador",
      createdAt: "2026-08-30T12:00:00.000Z",
    },
    {
      id: "51",
      title: "Idea anterior",
      description: "",
      status: "Borrador",
      createdAt: "2026-08-29T12:00:00.000Z",
    },
  ],
  scripts: [],
  content: [],
  tasks: [],
  notes: [],
  meetings: [],
  files: [],
  metrics: [],
  insights: [],
  campaigns: [],
  activity: [],
} as ClientWorkspaceData;

const navigationData = {
  ...data,
  scripts: [
    {
      id: "62",
      title: "Guion original",
      hook: "Arranque original",
      body: "Cuerpo original",
      cta: "CTA original",
      status: "Borrador",
      updatedAt: "2026-08-30T12:00:00.000Z",
    },
    {
      id: "61",
      title: "Guion anterior",
      hook: "Arranque anterior",
      body: "Cuerpo anterior",
      cta: "CTA anterior",
      status: "Borrador",
      updatedAt: "2026-08-29T12:00:00.000Z",
    },
  ],
  content: [
    {
      id: "72",
      title: "Contenido original",
      status: "Idea",
      format: "Reel",
      channel: "Instagram",
      updatedAt: "2026-08-30T12:00:00.000Z",
    },
    {
      id: "71",
      title: "Contenido anterior",
      status: "Idea",
      format: "Reel",
      channel: "Instagram",
      updatedAt: "2026-08-29T12:00:00.000Z",
    },
  ],
} as ClientWorkspaceData;

async function traverseHistory(direction: "back" | "forward") {
  await act(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener("popstate", () => resolve(), { once: true });
        window.history[direction]();
      }),
  );
}

describe("IdeasWorkspace deep links", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/clients/gavilan/ideas/52");
    window.sessionStorage.clear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/ideas/51/duplicate") {
          return response(
            {
              idea: {
                ...data.ideas[1],
                id: "98",
                title: "Idea anterior (copia)",
              },
            },
            201,
          );
        }
        if (url === "/api/ideas" && init?.method === "POST") {
          return response(
            {
              idea: {
                id: "99",
                title: "Serie documental",
                description: "Detrás de escena",
                status: "Borrador",
                createdAt: "2026-08-30T13:00:00.000Z",
              },
            },
            201,
          );
        }
        if (url === "/api/ideas/99" && init?.method === "DELETE") {
          return response({ ok: true });
        }
        throw new Error(`Fetch inesperado: ${url}`);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    push.mockReset();
    replace.mockReset();
  });

  it("publishes the real initial idea as the current view", async () => {
    window.history.replaceState({}, "", "/clients/gavilan/ideas");
    const contexts: Array<Record<string, unknown>> = [];
    const receiveContext = (event: Event) => {
      contexts.push((event as CustomEvent).detail);
    };
    window.addEventListener("martu:context", receiveContext);

    try {
      render(<IdeasWorkspace data={data} />);

      await waitFor(() => {
        expect(window.location.pathname).toBe("/clients/gavilan/ideas");
        expect(contexts.at(-1)).toMatchObject({
          clientSlug: "gavilan",
          section: "ideas",
          entityType: "idea",
          entityId: "52",
          entityTitle: "Idea original",
        });
        expect(JSON.parse(window.sessionStorage.getItem("martu-current-context") || "null")).toMatchObject({
          entityId: "52",
          entityTitle: "Idea original",
        });
      });
    } finally {
      window.removeEventListener("martu:context", receiveContext);
    }
  });

  it("opens the existing idea dialog from the Mi día activation link", () => {
    window.history.replaceState({}, "", "/clients/gavilan/ideas?new=1");

    render(<IdeasWorkspace data={data} openCreate />);

    expect(screen.getByRole("dialog", { name: "Capturá lo que apareció" })).toBeTruthy();
    expect(window.location.pathname).toBe("/clients/gavilan/ideas");
    expect(window.location.search).toBe("");
  });

  it("keeps selection, duplicate, create and archive on the canonical object URL", async () => {
    const contexts: Array<Record<string, unknown>> = [];
    const receiveContext = (event: Event) => {
      contexts.push((event as CustomEvent).detail);
    };
    window.addEventListener("martu:context", receiveContext);

    try {
      render(<IdeasWorkspace data={data} selectedEntityId="52" />);

      fireEvent.click(screen.getByRole("button", { name: /Idea anterior/ }));
      expect(window.location.pathname).toBe("/clients/gavilan/ideas/51");

      fireEvent.click(screen.getByRole("button", { name: "Duplicar idea" }));
      await screen.findByRole("heading", { name: "Idea anterior (copia)" });
      expect(window.location.pathname).toBe("/clients/gavilan/ideas/98");

      fireEvent.click(screen.getByRole("button", { name: "Nueva idea" }));
      const dialog = screen.getByRole("dialog", {
        name: "Capturá lo que apareció",
      });
      fireEvent.change(dialog.querySelector("input")!, {
        target: { value: "Serie documental" },
      });
      fireEvent.change(dialog.querySelector("textarea")!, {
        target: { value: "Detrás de escena" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Crear idea" }),
      );
      await screen.findByRole("heading", { name: "Serie documental" });
      expect(window.location.pathname).toBe("/clients/gavilan/ideas/99");

      fireEvent.click(screen.getByRole("button", { name: "Archivar idea" }));
      await waitFor(() => {
        expect(window.location.pathname).toBe("/clients/gavilan/ideas/98");
      });
      expect(
        screen.getByRole("heading", { name: "Idea anterior (copia)" }),
      ).toBeTruthy();
      expect(contexts.at(-1)).toMatchObject({
        clientSlug: "gavilan",
        section: "ideas",
        entityType: "idea",
        entityId: "98",
        entityTitle: "Idea anterior (copia)",
      });
      expect(push).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("martu:context", receiveContext);
    }
  });

  it("reconciles the selected idea on browser back and forward", async () => {
    render(<IdeasWorkspace data={data} selectedEntityId="52" />);

    fireEvent.click(screen.getByRole("button", { name: /Idea anterior/ }));
    expect(window.location.pathname).toBe("/clients/gavilan/ideas/51");
    expect(screen.getByRole("heading", { name: "Idea anterior" })).toBeTruthy();

    await traverseHistory("back");
    await screen.findByRole("heading", { name: "Idea original" });
    expect(window.location.pathname).toBe("/clients/gavilan/ideas/52");

    await traverseHistory("forward");
    await screen.findByRole("heading", { name: "Idea anterior" });
    expect(window.location.pathname).toBe("/clients/gavilan/ideas/51");
  });

  it("reconciles guiones and contenido on browser history traversal", async () => {
    window.history.replaceState({}, "", "/clients/gavilan/guiones/62");
    const scripts = render(
      <ScriptsWorkspace data={navigationData} selectedEntityId="62" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Guion anterior/ }));
    expect(window.location.pathname).toBe("/clients/gavilan/guiones/61");
    await traverseHistory("back");
    await screen.findByRole("heading", { name: "Guion original" });
    expect(window.location.pathname).toBe("/clients/gavilan/guiones/62");
    scripts.unmount();

    window.history.replaceState({}, "", "/clients/gavilan/contenido/72");
    render(<ContentWorkspace data={navigationData} selectedEntityId="72" />);

    fireEvent.click(screen.getByRole("button", { name: /Contenido anterior/ }));
    expect(window.location.pathname).toBe("/clients/gavilan/contenido/71");
    await traverseHistory("back");
    await screen.findByRole("heading", { name: "Contenido original" });
    expect(window.location.pathname).toBe("/clients/gavilan/contenido/72");
  });
});
