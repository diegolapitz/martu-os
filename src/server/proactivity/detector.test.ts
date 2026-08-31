import { describe, expect, it } from "vitest";

import type { CommunicationProfile } from "@/server/agent/types";

import { DeterministicNudgeDetector } from "./detector";
import type { ProactivitySnapshot } from "./types";

const profile: CommunicationProfile = {
  language: "es-AR",
  formality: 2,
  preferredLength: "short",
  humor: 3,
  insistenceLevel: 3,
  quietHoursStart: "22:30",
  quietHoursEnd: "08:30",
  morningBriefingAt: "09:00",
  morningBriefingEnabled: true,
  middayCheckAt: "13:30",
  middayCheckEnabled: true,
  endOfDayEnabled: false,
  expressions: ["che", "dale"],
  preferences: {},
};

function snapshot(
  overrides: Partial<ProactivitySnapshot> = {},
): ProactivitySnapshot {
  return {
    now: "2026-08-29T15:00:00.000Z",
    clients: [],
    tasks: [],
    commitments: [],
    reminders: [],
    content: [],
    meetingActions: [],
    metricOpportunities: [],
    openLoops: [],
    existingNudges: [],
    profile,
    ...overrides,
  };
}

describe("DeterministicNudgeDetector", () => {
  it("detects an overdue commitment and provides supervisor quick actions", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        commitments: [
          {
            id: "44",
            clientId: "2",
            clientSlug: "luma-estudio",
            clientName: "Luma Estudio",
            title: "Tercer reel",
            status: "open",
            dueAt: "2026-08-29T14:55:00.000Z",
            updatedAt: "2026-08-28T12:00:00.000Z",
            source: "chat",
          },
        ],
      }),
    );
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      kind: "commitment_due",
      priority: "urgent",
      clientSlug: "luma-estudio",
      entityId: "44",
    });
    expect(detected[0].quickActions).toEqual(
      expect.arrayContaining(["reschedule", "complete", "reduce_insistence"]),
    );
  });

  it("never asks for strategy on a content-only client", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        clients: [
          {
            id: "2",
            slug: "luma-estudio",
            name: "Luma Estudio",
            services: ["ideas", "scripts", "recording", "editing"],
            hasBrief: false,
            hasStrategy: false,
          },
        ],
      }),
    );
    expect(
      detected.some(
        (item) =>
          item.kind === "missing_brief" || item.kind === "missing_strategy",
      ),
    ).toBe(false);
  });

  it("raises the next missing strategic foundation without stacking two alerts", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        clients: [
          {
            id: "1",
            slug: "gavilan",
            name: "Gavilán",
            services: ["estrategia", "guiones"],
            hasBrief: false,
            hasStrategy: false,
          },
        ],
      }),
    );
    expect(detected.map((item) => item.kind)).toEqual(["missing_brief"]);

    const afterBrief = new DeterministicNudgeDetector().detect(
      snapshot({
        clients: [
          {
            id: "1",
            slug: "gavilan",
            name: "Gavilán",
            services: ["estrategia", "guiones"],
            hasBrief: true,
            hasStrategy: false,
          },
        ],
      }),
    );
    expect(afterBrief.map((item) => item.kind)).toEqual(["missing_strategy"]);
  });

  it("drops stale catch-up reminders after three days", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        reminders: [
          {
            id: "9",
            title: "Viejo",
            status: "pending",
            remindAt: "2026-08-20T12:00:00.000Z",
            updatedAt: "2026-08-20T12:00:00.000Z",
          },
        ],
      }),
    );
    expect(detected).toHaveLength(0);
  });

  it("uses a due reminder as the single alert for its linked commitment", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        commitments: [
          {
            id: "44",
            title: "Cerrar reel",
            status: "open",
            dueAt: "2026-08-29T14:00:00.000Z",
            updatedAt: "2026-08-28T12:00:00.000Z",
          },
        ],
        reminders: [
          {
            id: "77",
            title: "Cerrar reel",
            status: "pending",
            remindAt: "2026-08-29T14:00:00.000Z",
            updatedAt: "2026-08-28T12:00:00.000Z",
            targetType: "commitment",
            targetId: "44",
          },
        ],
      }),
    );

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      kind: "reminder_due",
      entityType: "commitment",
      entityId: "44",
    });
    expect(detected[0].facts.reminderId).toBe("77");
  });

  it("emits at most one stalled-content alert per client", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        content: [
          {
            id: "1",
            clientId: "2",
            clientSlug: "luma",
            title: "Viejo",
            status: "editing",
            updatedAt: "2026-08-20T12:00:00.000Z",
          },
          {
            id: "2",
            clientId: "2",
            clientSlug: "luma",
            title: "También viejo",
            status: "recorded",
            updatedAt: "2026-08-21T12:00:00.000Z",
          },
        ],
      }),
    );

    expect(
      detected.filter((item) => item.kind === "content_stalled"),
    ).toHaveLength(1);
    expect(detected[0].entityId).toBe("1");
  });

  it("does not deliver an orphan reminder after its commitment closed", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        commitments: [],
        reminders: [
          {
            id: "77",
            title: "Compromiso ya cerrado",
            status: "pending",
            remindAt: "2026-08-29T14:00:00.000Z",
            updatedAt: "2026-08-28T12:00:00.000Z",
            targetType: "commitment",
            targetId: "44",
          },
        ],
      }),
    );

    expect(detected).toHaveLength(0);
  });

  it("honors a reduced insistence profile while keeping explicit promises", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        profile: { ...profile, insistenceLevel: 1 },
        commitments: [
          {
            id: "44",
            title: "Promesa",
            status: "open",
            dueAt: "2026-08-29T14:00:00.000Z",
            updatedAt: "2026-08-28T12:00:00.000Z",
          },
        ],
        content: [
          {
            id: "1",
            clientId: "2",
            title: "Pieza quieta",
            status: "editing",
            updatedAt: "2026-08-20T12:00:00.000Z",
          },
        ],
        clients: [
          {
            id: "2",
            slug: "gavilan",
            name: "Gavilán",
            services: ["estrategia"],
            hasBrief: false,
            hasStrategy: false,
          },
        ],
      }),
    );

    expect(detected.map((item) => item.kind)).toEqual(["commitment_due"]);
  });

  it("catches up a missed daily briefing once without reviving it all day", () => {
    const withinWindow = new DeterministicNudgeDetector().detect(
      snapshot({
        now: "2026-08-29T13:45:00.000Z", // 10:45 in Buenos Aires, after a 09:00 briefing.
      }),
    );
    expect(withinWindow.some((item) => item.kind === "morning_briefing")).toBe(
      true,
    );

    const tooLate = new DeterministicNudgeDetector().detect(
      snapshot({
        now: "2026-08-29T15:01:00.000Z", // 12:01 local, outside the two-hour window.
      }),
    );
    expect(tooLate.some((item) => item.kind === "morning_briefing")).toBe(
      false,
    );
  });

  it("does not schedule check-ins disabled from persisted settings", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        now: "2026-08-29T13:45:00.000Z",
        profile: {
          ...profile,
          morningBriefingEnabled: false,
          middayCheckEnabled: false,
        },
      }),
    );

    expect(
      detected.some(
        (item) =>
          item.kind === "morning_briefing" || item.kind === "midday_check",
      ),
    ).toBe(false);
  });

  it("resurfaces an old salient open loop without inventing a deadline", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        openLoops: [
          {
            id: "41",
            clientId: "1",
            clientSlug: "gavilan",
            clientName: "Gavilán",
            title: "Serie con testimonios cortos",
            body: "Explorar cuando haya aire.",
            kind: "idea",
            salience: 4,
            surfaceCount: 0,
            createdAt: "2026-08-20T15:00:00.000Z",
            updatedAt: "2026-08-20T15:00:00.000Z",
          },
        ],
      }),
    );

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      kind: "open_loop_resurface",
      dedupeKey: "open_loop:41:surface:1",
      entityType: "open_loop",
      entityId: "41",
      clientSlug: "gavilan",
    });
    expect(detected[0].dueAt).toBeUndefined();
    expect(detected[0].facts).not.toHaveProperty("dueAt");
  });

  it("keeps young, low-salience, cooled-down and repeatedly surfaced loops quiet", () => {
    const common = {
      body: "",
      kind: "topic",
      clientId: null,
      clientSlug: null,
      clientName: null,
      updatedAt: "2026-08-20T15:00:00.000Z",
    };
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        openLoops: [
          {
            ...common,
            id: "1",
            title: "Muy nuevo",
            salience: 5,
            surfaceCount: 0,
            createdAt: "2026-08-29T09:00:00.000Z",
          },
          {
            ...common,
            id: "2",
            title: "Poco relevante",
            salience: 2,
            surfaceCount: 0,
            createdAt: "2026-08-01T09:00:00.000Z",
          },
          {
            ...common,
            id: "3",
            title: "En cooldown",
            salience: 5,
            surfaceCount: 1,
            createdAt: "2026-07-01T09:00:00.000Z",
            lastSurfacedAt: "2026-08-25T15:00:00.000Z",
          },
          {
            ...common,
            id: "4",
            title: "Límite alcanzado",
            salience: 5,
            surfaceCount: 3,
            createdAt: "2026-07-01T09:00:00.000Z",
          },
          {
            ...common,
            id: "5",
            title: "Pospuesto",
            salience: 5,
            surfaceCount: 0,
            createdAt: "2026-07-01T09:00:00.000Z",
            nextEligibleAt: "2026-09-10T15:00:00.000Z",
          },
        ],
      }),
    );

    expect(detected).toEqual([]);
  });

  it("allows the second surface after the first fourteen-day cooldown", () => {
    const detected = new DeterministicNudgeDetector().detect(
      snapshot({
        openLoops: [
          {
            id: "second-cycle",
            title: "Tema todavía abierto",
            body: "",
            kind: "topic",
            salience: 5,
            surfaceCount: 1,
            createdAt: "2026-07-01T09:00:00.000Z",
            updatedAt: "2026-08-14T15:00:00.000Z",
            lastSurfacedAt: "2026-08-14T15:00:00.000Z",
            nextEligibleAt: "2026-08-28T15:00:00.000Z",
          },
        ],
      }),
    );

    expect(detected).toHaveLength(1);
    expect(detected[0].dedupeKey).toBe("open_loop:second-cycle:surface:2");
  });
});
