import { describe, expect, it } from "vitest";
import { activityLabel } from "@/lib/activity-label";

describe("activityLabel", () => {
  it.each([
    ["agent_action", "Conversación"],
    ["campaign.updated", "Pauta"],
    ["commitment.created", "Compromiso"],
    ["content.created", "Contenido"],
    ["content.published", "Contenido"],
    ["content.reordered", "Contenido"],
    ["content.scheduled", "Contenido"],
    ["content.status_changed", "Contenido"],
    ["file.created", "Archivo"],
    ["idea.created", "Idea"],
    ["idea_created", "Idea"],
    ["meeting.completed", "Reunión"],
    ["metric.reviewed", "Métrica"],
    ["note.created", "Nota"],
    ["note_created", "Nota"],
    ["open_loop_created", "Hilo abierto"],
    ["script.created", "Guion"],
    ["script.updated", "Guion"],
    ["task.created", "Tarea"],
    ["work.created", "Trabajo"],
  ])("maps %s to %s", (kind, label) => {
    expect(activityLabel(kind)).toBe(label);
  });

  it("uses a known subject or entity without exposing internal separators", () => {
    expect(activityLabel("content.future_transition")).toBe("Contenido");
    expect(activityLabel("future.internal_event", "meeting")).toBe("Reunión");
    expect(activityLabel("future.internal_event")).toBe("Actividad");
  });
});
