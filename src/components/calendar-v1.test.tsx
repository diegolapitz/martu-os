// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarV1 } from "./calendar-v1";

describe("CalendarV1 creation deep link", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/calendar?new=1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ events: [], clients: [] }),
      }) as Response),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens the existing event dialog and consumes the query flag", async () => {
    render(<CalendarV1 openCreate />);

    expect(await screen.findByRole("dialog", { name: "Agendar algo" })).toBeTruthy();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/calendar");
      expect(window.location.search).toBe("");
    });
  });
});
