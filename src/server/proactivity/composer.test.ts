import { describe, expect, it } from "vitest";

import { NaturalNudgeComposer } from "./composer";
import type { PersistedNudge, ProactivitySnapshot } from "./types";

describe("NaturalNudgeComposer", () => {
  it("keeps legacy seeded nudges deliverable instead of producing an empty message", async () => {
    const nudge = {
      id: "1",
      kind: "legacy_kind",
      dedupeKey: "legacy:1",
      priority: "high",
      title: "Aviso existente",
      message: "Texto curado del aviso existente.",
      facts: {},
      deepLink: "/day",
      cooldownMinutes: 60,
      quickActions: [],
      status: "pending",
      createdAt: "2026-08-29T15:00:00.000Z",
    } as unknown as PersistedNudge;
    const snapshot = { tasks: [] } as unknown as ProactivitySnapshot;

    const composed = await new NaturalNudgeComposer().compose(nudge, snapshot);

    expect(composed.body).toBe("Texto curado del aviso existente.");
  });

  it.each([
    ["to_record", "quedó para grabar"],
    ["approval", "quedó esperando aprobación"],
    ["script", "quedó en guion"],
    ["editing", "quedó en edición"],
  ])("humanizes the %s workflow state", async (status, expected) => {
    const nudge = {
      id: "2",
      kind: "content_stalled",
      dedupeKey: `content:${status}`,
      priority: "medium",
      title: "Pieza quieta",
      facts: { title: "Pieza quieta", clientName: "Gavilán", status },
      deepLink: "/clients/gavilan/contenido",
      cooldownMinutes: 60,
      quickActions: [],
      status: "pending",
      createdAt: "2026-08-29T15:00:00.000Z",
    } as unknown as PersistedNudge;
    const snapshot = { tasks: [] } as unknown as ProactivitySnapshot;

    const composed = await new NaturalNudgeComposer().compose(nudge, snapshot);

    expect(composed.body).toContain(expected);
    expect(composed.body).not.toMatch(/\b(?:to_record|approval|script|editing)\b/);
  });
});
