import { describe, expect, it } from "vitest";

import { isQuietTime } from "./quiet-hours";

describe("isQuietTime", () => {
  it("handles quiet hours that cross midnight in Buenos Aires", () => {
    expect(isQuietTime(new Date("2026-08-30T02:00:00.000Z"), "22:30", "08:30")).toBe(true);
    expect(isQuietTime(new Date("2026-08-30T14:00:00.000Z"), "22:30", "08:30")).toBe(false);
  });
});
