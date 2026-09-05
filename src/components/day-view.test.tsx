// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DayData } from "./types";
import { DayView } from "./day-view";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const emptyDay: DayData = {
  date: "2026-09-05T12:00:00.000Z",
  greeting: "Buen día, Martu.",
  supervisorMessage: "No hay urgencias abiertas.",
  priorities: [],
  agenda: [],
  clientsNeedingAttention: [],
  stats: { openTasks: 0, overdueTasks: 0, pendingNudges: 0 },
  hasClients: true,
  activation: { empty: true, firstClientSlug: "gavilan" },
};

describe("DayView first activation", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }) as Response),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    refresh.mockReset();
  });

  it("offers one primary action and deep links to the existing idea and calendar flows", () => {
    render(<DayView data={emptyDay} />);

    expect(screen.getByTestId("day-activation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear primer pendiente" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Capturar una idea" }).getAttribute("href"))
      .toBe("/clients/gavilan/ideas?new=1");
    expect(screen.getByRole("link", { name: "Agendar una fecha" }).getAttribute("href"))
      .toBe("/calendar?new=1");
    expect(screen.getByRole("list", { name: "Flujo de contenido conectado" }).textContent)
      .toContain("IdeaGuionContenido");
  });

  it("can be dismissed without creating anything", () => {
    render(<DayView data={emptyDay} />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar bienvenida" }));

    expect(screen.queryByTestId("day-activation")).toBeNull();
    expect(screen.getByTestId("quick-capture")).toBeTruthy();
  });

  it("creates the first pending task through the existing work endpoint", async () => {
    render(<DayView data={emptyDay} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear primer pendiente" }));
    const input = screen.getByRole("textbox", { name: "¿Qué necesitás resolver?" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Enviar propuesta a Gavilán" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear pendiente" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Enviar propuesta a Gavilán",
          status: "pending",
          priority: "medium",
          bucket: "today",
          kind: "task",
        }),
      });
    });
    expect(screen.queryByTestId("day-activation")).toBeNull();
  });

  it("does not appear for an account with existing activity", () => {
    render(<DayView data={{ ...emptyDay, activation: { empty: false } }} />);

    expect(screen.queryByTestId("day-activation")).toBeNull();
    expect(screen.getByTestId("quick-capture")).toBeTruthy();
  });
});
