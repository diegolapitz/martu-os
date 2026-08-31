import { describe, expect, it } from "vitest";

import {
  humanizeNotificationCopy,
  humanizeWorkflowStatus,
} from "./copy";

describe("notification copy", () => {
  it.each([
    ["idea", "en idea"],
    ["script", "en guion"],
    ["to_record", "para grabar"],
    ["recorded", "grabado"],
    ["editing", "en edición"],
    ["ready", "listo"],
    ["approval", "esperando aprobación"],
    ["approved", "aprobado"],
    ["scheduled", "programado"],
    ["published", "publicado"],
    ["delivered", "entregado"],
    ["in_progress", "en curso"],
  ])("presents %s as natural Spanish", (status, expected) => {
    expect(humanizeWorkflowStatus(status)).toBe(expected);
  });

  it("uses a safe natural fallback for an unknown workflow state", () => {
    expect(humanizeWorkflowStatus("waiting_for_brand_signoff")).toBe(
      "en una etapa pendiente",
    );
  });

  it.each([
    [
      "“Historias” quedó clavado en to_record.",
      "“Historias” quedó clavado para grabar.",
    ],
    [
      "“Reposición” quedó clavado en approval.",
      "“Reposición” quedó clavado esperando aprobación.",
    ],
    [
      "“Una reforma” quedó clavado en script.",
      "“Una reforma” quedó clavado en guion.",
    ],
    [
      "kind: task_due_soon; status: pending.",
      "tipo: tarea próxima a vencer; estado: pendiente.",
    ],
  ])("repairs persisted copy: %s", (raw, expected) => {
    expect(humanizeNotificationCopy(raw)).toBe(expected);
  });

  it("never leaks a future snake_case value from a controlled field", () => {
    const copy = humanizeNotificationCopy(
      "La pieza quedó clavada en waiting_for_brand_signoff.",
    );

    expect(copy).toBe("La pieza quedó clavada en una etapa pendiente.");
    expect(copy).not.toMatch(/\w+_\w+/);
  });

  it("preserves titles, names and ordinary product copy verbatim", () => {
    expect(
      humanizeNotificationCopy(
        "“Open House · Ready to record” de Script Lab quedó como idea abierta.",
      ),
    ).toBe(
      "“Open House · Ready to record” de Script Lab quedó como idea abierta.",
    );
  });

  it("repairs the controlled state without touching an English title", () => {
    expect(
      humanizeNotificationCopy(
        "“Open House · Script approval” quedó clavado en approval.",
      ),
    ).toBe(
      "“Open House · Script approval” quedó clavado esperando aprobación.",
    );
  });
});
