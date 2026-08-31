import { describe, expect, it, vi } from "vitest";

const queryState = vi.hoisted(() => ({
  active: 0,
  maxActive: 0,
  statements: [] as string[],
}));

vi.mock("@/server/db", () => ({
  query: vi.fn(async (statement: string) => {
    queryState.active += 1;
    queryState.maxActive = Math.max(queryState.maxActive, queryState.active);
    queryState.statements.push(statement.trim());

    await new Promise((resolve) => setTimeout(resolve, 2));
    queryState.active -= 1;

    if (statement.includes("as open_count")) {
      return [{ open_count: "0", overdue_count: "0" }];
    }
    if (statement.includes("from public.ai_nudges")) {
      return [{ count: "0" }];
    }
    if (statement.includes("select c.id, c.slug")) {
      return [
        {
          id: "1",
          slug: "qa",
          name: "QA",
          description: "",
          summary: "",
          status: "active",
          updated_at: "2026-08-30T12:00:00.000Z",
          next_task_due: null,
          overdue_count: "0",
          brief_status: "complete",
        },
      ];
    }
    return [];
  }),
}));

import { getDayData } from "./queries";

describe("getDayData query scheduling", () => {
  it("serializes its read-only dashboard queries for the single cloud connection", async () => {
    const data = await getDayData({ now: new Date("2026-08-30T12:00:00.000Z") });

    expect(data.stats).toEqual({
      openTasks: 0,
      overdueTasks: 0,
      pendingNudges: 0,
    });
    expect(queryState.statements).toHaveLength(7);
    expect(queryState.statements.every((statement) => statement.startsWith("select"))).toBe(true);
    expect(queryState.maxActive).toBe(1);
  });
});
